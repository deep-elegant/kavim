import {
  IMAGE_NODE_MIN_HEIGHT,
  IMAGE_NODE_MIN_WIDTH,
} from "./ImageNode";
import {
  MAX_IMAGE_DIMENSION,
  loadImageDimensions,
} from "../hooks/useCanvasImageNodes";

export const AI_IMAGE_VERTICAL_GAP = 24;

export const scaleImageDimensions = (
  naturalWidth: number,
  naturalHeight: number,
) => {
  let width = IMAGE_NODE_MIN_WIDTH;
  let height = IMAGE_NODE_MIN_HEIGHT;

  if (naturalWidth > 0 && naturalHeight > 0) {
    const widthScale = MAX_IMAGE_DIMENSION / naturalWidth;
    const heightScale = MAX_IMAGE_DIMENSION / naturalHeight;
    const scale = Math.min(1, widthScale, heightScale);

    width = Math.max(
      IMAGE_NODE_MIN_WIDTH,
      Math.round(naturalWidth * scale),
    );
    height = Math.max(
      IMAGE_NODE_MIN_HEIGHT,
      Math.round(naturalHeight * scale),
    );

    const aspectRatio = naturalWidth / naturalHeight || 1;

    if (height < IMAGE_NODE_MIN_HEIGHT) {
      height = IMAGE_NODE_MIN_HEIGHT;
      width = Math.max(
        IMAGE_NODE_MIN_WIDTH,
        Math.round(height * aspectRatio),
      );
    }

    if (width < IMAGE_NODE_MIN_WIDTH) {
      width = IMAGE_NODE_MIN_WIDTH;
      height = Math.max(
        IMAGE_NODE_MIN_HEIGHT,
        Math.round(width / aspectRatio),
      );
    }
  }

  return { width, height };
};

export const computeImageDisplaySize = async (
  src: string,
  loadDimensions: typeof loadImageDimensions = loadImageDimensions,
) => {
  try {
    const { width: naturalWidth, height: naturalHeight } =
      await loadDimensions(src);

    const { width, height } = scaleImageDimensions(naturalWidth, naturalHeight);

    return { width, height, naturalWidth, naturalHeight };
  } catch (error) {
    console.error("Failed to determine image dimensions", error);
    return {
      width: IMAGE_NODE_MIN_WIDTH,
      height: IMAGE_NODE_MIN_HEIGHT,
      naturalWidth: 0,
      naturalHeight: 0,
    };
  }
};
