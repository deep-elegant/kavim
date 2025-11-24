import { useCallback, useEffect, useLayoutEffect } from "react";
import type { Editor } from "@tiptap/react";

export interface UseTextNodeSizingOptions {
  editor: Editor | null;
  html: string;
  containerRef: React.RefObject<HTMLElement>;
  measurementRef: React.RefObject<HTMLElement>;
  minSize?: number;
  /**
   * Optional upper bound for auto font size.
   * - Accepts a numeric cap or a callback that reacts to container bounds.
   */
  maxSize?: number | ((bounds: { width: number; height: number }) => number);
}

const DEFAULT_MIN_SIZE = 8;

/**
 * Automatically scales font size to fit content within container bounds.
 * - Uses binary search on a hidden measurement element to find largest size without overflow.
 * - Re-measures on content change (html) or container resize.
 */
export const useTextNodeSizing = ({
  editor,
  html,
  containerRef,
  measurementRef,
  minSize,
  maxSize,
}: UseTextNodeSizingOptions) => {
  const measure = useCallback(() => {
    if (!editor) {
      return;
    }

    const containerElement = containerRef.current;
    const measurementElement = measurementRef.current;

    if (!containerElement || !measurementElement) {
      return;
    }

    const { clientWidth, clientHeight } = containerElement;
    if (clientWidth <= 0 || clientHeight <= 0) {
      return; // Skip if container not yet rendered or hidden
    }

    const resolvedMax =
      typeof maxSize === "function"
        ? maxSize({ width: clientWidth, height: clientHeight })
        : maxSize;
    const minBound = Math.max(1, Math.floor(minSize ?? DEFAULT_MIN_SIZE));
    const maxCandidate =
      Number.isFinite(resolvedMax) && resolvedMax !== undefined
        ? resolvedMax
        : Math.max(clientWidth, clientHeight, minBound);
    const maxBound = Math.max(minBound, Math.floor(maxCandidate));

    // Binary search to find largest font size that doesn't overflow
    let low = minBound;
    let high = maxBound;
    let best = minBound;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      // eslint-disable-next-line react-compiler/react-compiler -- mutate hidden probe element to test candidate font size
      measurementElement.style.fontSize = `${mid}px`;

      const overflow =
        measurementElement.scrollWidth > clientWidth ||
        measurementElement.scrollHeight > clientHeight;

      if (!overflow) {
        best = mid; // This size fits, try larger
        low = mid + 1;
      } else {
        high = mid - 1; // Overflows, try smaller
      }
    }

    // Update with source="auto" to distinguish from user actions
    editor.commands.setFontSize(best, "auto");
  }, [editor, containerRef, measurementRef, minSize, maxSize]);

  // useLayoutEffect ensures measurement happens before paint to avoid flicker
  const container = containerRef.current;
  const measurement = measurementRef.current;
  useLayoutEffect(() => {
    measure();
  }, [measure, html, container, measurement]);

  useEffect(() => {
    if (!editor || !container || typeof ResizeObserver === "undefined") {
      return;
    }

    // Re-measure when user resizes the node
    const observer = new ResizeObserver(() => {
      measure();
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, [editor, container, measure]);
};
