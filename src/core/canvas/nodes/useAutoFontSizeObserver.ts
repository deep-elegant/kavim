import { useCallback, useEffect, useLayoutEffect } from 'react';
import type { Editor } from '@tiptap/react';

import type { FontSizeSetting } from '@/components/ui/minimal-tiptap/FontSizePlugin';

export interface UseAutoFontSizeObserverOptions {
  editor: Editor | null;
  fontSize: FontSizeSetting;
  html: string;
  containerRef: React.RefObject<HTMLElement>;
  measurementRef: React.RefObject<HTMLElement>; // Hidden clone used for overflow detection
  minSize?: number;
  maxSize?: number;
}

const DEFAULT_MIN_SIZE = 8;

/**
 * Automatically scales font size to fit content within container bounds.
 * - Uses binary search on a hidden measurement element to find largest size without overflow.
 * - Re-measures on content change (html) or container resize.
 * - Only active when mode is 'auto'; manual mode bypasses this logic.
 */
export const useAutoFontSizeObserver = ({
  editor,
  fontSize,
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

    if (fontSize !== 'auto') {
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

    const minBound = Math.max(1, Math.floor(minSize ?? DEFAULT_MIN_SIZE));
    const maxCandidate =
      maxSize ?? Math.max(clientWidth, clientHeight, minBound);
    const maxBound = Math.max(minBound, Math.floor(maxCandidate));

    // Binary search to find largest font size that doesn't overflow
    let low = minBound;
    let high = maxBound;
    let best = minBound;

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
  }, [editor, fontSize, containerRef, measurementRef, minSize, maxSize]);

  // useLayoutEffect ensures measurement happens before paint to avoid flicker
  useLayoutEffect(() => {
    measure();
  }, [measure, html, fontSize]);

  useEffect(() => {
    if (!editor || fontSize !== 'auto') {
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
  }, [editor, fontSize, containerRef, measure]);
};
