import { describe, expect, it } from "vitest";

import {
  AI_IMAGE_VERTICAL_GAP, // ensure exported constant is accessible for potential use
  scaleImageDimensions,
} from "@/core/canvas/nodes/aiImageUtils";
import {
  IMAGE_NODE_MIN_HEIGHT,
  IMAGE_NODE_MIN_WIDTH,
} from "@/core/canvas/nodes/ImageNode";
import { MAX_IMAGE_DIMENSION } from "@/core/canvas/hooks/useCanvasImageNodes";

// AI_IMAGE_VERTICAL_GAP is imported to confirm the helper exports remain accessible even if not used directly here.
void AI_IMAGE_VERTICAL_GAP;

describe("scaleImageDimensions", () => {
  it("returns minimum dimensions when natural size is below thresholds", () => {
    expect(scaleImageDimensions(50, 50)).toEqual({
      width: IMAGE_NODE_MIN_WIDTH,
      height: IMAGE_NODE_MIN_HEIGHT,
    });
  });

  it("scales large images down to fit within the maximum dimension", () => {
    expect(scaleImageDimensions(1000, 500)).toEqual({
      width: MAX_IMAGE_DIMENSION,
      height: 240,
    });
  });

  it("preserves aspect ratio for tall images", () => {
    expect(scaleImageDimensions(400, 1600)).toEqual({
      width: 120,
      height: MAX_IMAGE_DIMENSION,
    });
  });
});
