import { useCallback, useEffect, useLayoutEffect } from 'react';
import type { Editor } from '@tiptap/react';

import type { FontSizeMode } from '@/components/ui/minimal-tiptap/FontSizePlugin';

export interface UseAutoFontSizeObserverOptions {
  editor: Editor | null;
  mode: FontSizeMode;
  html: string;
  containerRef: React.RefObject<HTMLElement>;
  measurementRef: React.RefObject<HTMLElement>; // Hidden clone used for overflow detection
  minSize?: number;
  maxSize?: number;
}

const DEFAULT_MIN_SIZE = 8;
const DEFAULT_MAX_SIZE = 96;

/** Enforce reasonable bounds to prevent illegible or absurdly large text */
const clampBounds = (min?: number, max?: number) => {
  const safeMin = Math.max(1, Math.floor(min ?? DEFAULT_MIN_SIZE));
  const safeMax = Math.max(safeMin, Math.floor(max ?? DEFAULT_MAX_SIZE));

  return [safeMin, safeMax] as const;
};

/**
 * Automatically scales font size to fit content within container bounds.
 * - Uses binary search on a hidden measurement element to find largest size without overflow.
 * - Re-measures on content change (html) or container resize.
 * - Only active when mode is 'auto'; manual mode bypasses this logic.
 */
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
      return; // Manual mode: user controls font size explicitly
    }

    const container = containerRef.current;
    const measurement = measurementRef.current;

    if (!container || !measurement) {
      return;
    }

    const { clientWidth, clientHeight } = container;
    if (clientWidth <= 0 || clientHeight <= 0) {
      return; // Skip if container not yet rendered or hidden
    }

    const [min, max] = clampBounds(minSize, maxSize);

    // Binary search to find largest font size that doesn't overflow
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
        best = mid; // This size fits, try larger
        low = mid + 1;
      } else {
        high = mid - 1; // Overflows, try smaller
      }
    }

    editor.commands.updateAutoFontSize(best);
  }, [editor, mode, containerRef, measurementRef, minSize, maxSize]);

  // useLayoutEffect ensures measurement happens before paint to avoid flicker
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

    // Re-measure when user resizes the node
    const observer = new ResizeObserver(() => {
      measure();
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, [editor, mode, containerRef, measure]);
};
