import { useCallback, useEffect, useLayoutEffect } from 'react';
import type { Editor } from '@tiptap/react';

import type { FontSizeMode } from '@/helpers/FontSize';

export interface UseAutoFontSizeObserverOptions {
  editor: Editor | null;
  mode: FontSizeMode;
  html: string;
  containerRef: React.RefObject<HTMLElement>;
  measurementRef: React.RefObject<HTMLElement>;
  minSize?: number;
  maxSize?: number;
}

const DEFAULT_MIN_SIZE = 8;
const DEFAULT_MAX_SIZE = 96;

const clampBounds = (min?: number, max?: number) => {
  const safeMin = Math.max(1, Math.floor(min ?? DEFAULT_MIN_SIZE));
  const safeMax = Math.max(safeMin, Math.floor(max ?? DEFAULT_MAX_SIZE));

  return [safeMin, safeMax] as const;
};

export const useAutoFontSizeObserver = ({
  editor,
  mode,
  html,
  containerRef,
  measurementRef,
  minSize,
  maxSize,
}: UseAutoFontSizeObserverOptions) => {
  const measure = useCallback(() => {
    if (!editor || typeof editor.commands.updateAutoFontSize !== 'function') {
      return;
    }

    if (mode !== 'auto') {
      return;
    }

    const container = containerRef.current;
    const measurement = measurementRef.current;

    if (!container || !measurement) {
      return;
    }

    const { clientWidth, clientHeight } = container;
    if (clientWidth <= 0 || clientHeight <= 0) {
      return;
    }

    const [min, max] = clampBounds(minSize, maxSize);

    let low = min;
    let high = max;
    let best = min;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      measurement.style.fontSize = `${mid}px`;

      const overflow =
        measurement.scrollWidth > clientWidth ||
        measurement.scrollHeight > clientHeight;

      if (!overflow) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    editor.commands.updateAutoFontSize(best);
  }, [editor, mode, containerRef, measurementRef, minSize, maxSize]);

  useLayoutEffect(() => {
    measure();
  }, [measure, html, mode]);

  useEffect(() => {
    if (!editor || mode !== 'auto') {
      return;
    }

    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      measure();
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, [editor, mode, containerRef, measure]);
};
