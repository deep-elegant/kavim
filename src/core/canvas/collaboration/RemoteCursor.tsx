import React, { useEffect, useMemo, useState } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";

interface WindowSize {
  width: number;
  height: number;
}

// Prevent edge indicators from being flush with screen edges
const EDGE_MARGIN = 24;

const clamp = (value: number, min: number, max: number) => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

interface RemoteCursorProps {
  position: { x: number; y: number } | null;
  color?: string;
  label?: string;
}

/**
 * Displays a collaborator's cursor on the canvas.
 * - Shows cursor when in viewport, edge indicator when off-screen
 * - Position is in flow coordinates (not screen pixels)
 * - Converts flow coords to screen coords for rendering
 */

export function RemoteCursor({
  position,
  color = "#3b82f6",
  label = "Remote User",
}: RemoteCursorProps) {
  const { flowToScreenPosition } = useReactFlow();
  const { x: viewportX, y: viewportY, zoom: viewportZoom } = useViewport();

  // Track window size for viewport boundary checks (SSR-safe)
  const [windowSize, setWindowSize] = useState<WindowSize>(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  }));

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  /**
   * Convert flow coordinates to screen pixels.
   * - Recalculates when viewport changes (pan/zoom)
   */
  const screenPosition = useMemo(() => {
    if (!position) {
      return null;
    }

    return flowToScreenPosition(position);
  }, [flowToScreenPosition, position, viewportX, viewportY, viewportZoom]);

  if (
    !position ||
    !screenPosition ||
    windowSize.width === 0 ||
    windowSize.height === 0
  ) {
    return null;
  }

  // Check if cursor is visible in current viewport
  const withinHorizontalBounds =
    screenPosition.x >= 0 && screenPosition.x <= windowSize.width;
  const withinVerticalBounds =
    screenPosition.y >= 0 && screenPosition.y <= windowSize.height;
  const isWithinViewport = withinHorizontalBounds && withinVerticalBounds;

  // Clamp edge indicator position to stay within margin
  const clampedX = clamp(
    screenPosition.x,
    EDGE_MARGIN,
    windowSize.width - EDGE_MARGIN,
  );
  const clampedY = clamp(
    screenPosition.y,
    EDGE_MARGIN,
    windowSize.height - EDGE_MARGIN,
  );

  const indicatorTransform = `translate(${clampedX}px, ${clampedY}px) translate(-50%, -50%)`;
  const cursorTransform = `translate(${screenPosition.x}px, ${screenPosition.y}px) translate(-50%, -50%)`;

  /**
   * Arrow direction points toward off-screen cursor.
   * - Corner arrows for diagonal positions
   * - Edge arrows for single-axis offsets
   */
  const indicatorArrow = (() => {
    const isLeft = screenPosition.x < EDGE_MARGIN;
    const isRight = screenPosition.x > windowSize.width - EDGE_MARGIN;
    const isTop = screenPosition.y < EDGE_MARGIN;
    const isBottom = screenPosition.y > windowSize.height - EDGE_MARGIN;

    if (isTop && isLeft) return "↖";
    if (isTop && isRight) return "↗";
    if (isBottom && isLeft) return "↙";
    if (isBottom && isRight) return "↘";
    if (isTop) return "↑";
    if (isBottom) return "↓";
    if (isLeft) return "←";
    if (isRight) return "→";
    return "•";
  })();

  return (
    <div className="pointer-events-none fixed top-0 left-0 z-50">
      {isWithinViewport ? (
        // Full cursor with label when visible in viewport
        <div
          className="transition-opacity duration-200"
          style={{ opacity: 1, transform: cursorTransform }}
        >
          <div className="relative transition-transform duration-75 ease-out">
            {/* Custom cursor pointer icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M5.5 3.5L18.5 12.5L12 14L9.5 20.5L5.5 3.5Z"
                fill={color}
                stroke="white"
                strokeWidth="1.5"
              />
            </svg>
            <div
              className="absolute -top-1 left-6 rounded px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg"
              style={{ backgroundColor: color }}
            >
              {label}
            </div>
          </div>
        </div>
      ) : (
        // Edge indicator when cursor is off-screen
        <div
          className="flex flex-col items-center gap-1"
          style={{ transform: indicatorTransform }}
        >
          <div
            className="bg-background flex h-8 w-8 items-center justify-center rounded-full border-2 text-lg font-semibold shadow-lg"
            style={{ borderColor: color, color }}
          >
            {indicatorArrow}
          </div>
          <div
            className="rounded px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg"
            style={{ backgroundColor: color }}
          >
            {label}
          </div>
        </div>
      )}
    </div>
  );
}
