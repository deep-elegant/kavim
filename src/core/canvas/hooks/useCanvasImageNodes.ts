import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Node, XYPosition } from "@xyflow/react";

import {
  IMAGE_NODE_MIN_HEIGHT,
  IMAGE_NODE_MIN_WIDTH,
  type ImageNodeType,
} from "../nodes/ImageNode";
import type { CanvasNode, ToolId } from "../types";
import type { UsePakAssetsReturn } from "@/core/pak/usePakAssets";

/** File filter for image selection dialog */
export const IMAGE_FILE_FILTERS = [
  {
    name: "Images",
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"],
  },
];

/** Maximum dimension (width or height) for displayed images - scales down larger images */
export const MAX_IMAGE_DIMENSION = 480;

/**
 * Loads image from src and returns its natural dimensions.
 * - Used to calculate proper aspect ratios before displaying.
 */
export const loadImageDimensions = (src: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = (event) => {
      reject(event);
    };
    image.src = src;
  });

/** Extracts filename from full path (works with both / and \ separators) */
export const getFileName = (filePath: string) => {
  const segments = filePath.split(/[/\\]/);
  return segments[segments.length - 1] ?? filePath;
};

/**
 * Checks if a File is an image based on MIME type or extension.
 * - Handles cases where MIME type may be missing.
 */
export const isImageFile = (file: File) => {
  if (file.type.startsWith("image/")) {
    return true;
  }

  const lowerCaseName = file.name.toLowerCase();
  return IMAGE_FILE_FILTERS[0].extensions.some((extension) =>
    lowerCaseName.endsWith(`.${extension}`),
  );
};

export interface UseCanvasImageNodesParams {
  setNodes: Dispatch<SetStateAction<Node<CanvasNode>[]>>;
  setSelectedTool: Dispatch<SetStateAction<ToolId | null>>;
  screenToFlowPosition: (position: XYPosition) => XYPosition;
  getCanvasCenterPosition: () => XYPosition;
  registerAssetFromFilePath: UsePakAssetsReturn["registerAssetFromFilePath"];
  registerAssetFromFile: UsePakAssetsReturn["registerAssetFromFile"];
}

/**
 * Hook for adding and managing image nodes on the canvas.
 * - Provides method to add image nodes programmatically.
 * - Handles file dialog for image selection.
 * - Supports drag-and-drop image insertion.
 * - Auto-scales images to fit within MAX_IMAGE_DIMENSION while preserving aspect ratio.
 */
export const useCanvasImageNodes = ({
  setNodes,
  setSelectedTool,
  screenToFlowPosition,
  getCanvasCenterPosition,
  registerAssetFromFilePath,
  registerAssetFromFile,
}: UseCanvasImageNodesParams) => {
  /**
   * Adds a new image node to the canvas.
   * - Loads image to determine natural dimensions.
   * - Scales to fit within MAX_IMAGE_DIMENSION while respecting min sizes.
   * - Automatically selects the new node.
   */
  const addImageNode = useCallback(
    async (src: string, position: XYPosition, fileName?: string) => {
      let naturalWidth = 0;
      let naturalHeight = 0;
      let width = IMAGE_NODE_MIN_WIDTH;
      let height = IMAGE_NODE_MIN_HEIGHT;

      try {
        const dimensions = await loadImageDimensions(src);
        naturalWidth = dimensions.width;
        naturalHeight = dimensions.height;

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

          // Ensure minimum dimensions while maintaining aspect ratio
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
      } catch (error) {
        console.error("Failed to determine image dimensions", error);
      }

      const nodeId = crypto.randomUUID();
      const newNode: ImageNodeType = {
        id: nodeId,
        type: "image-node",
        position,
        data: {
          src,
          alt: fileName ?? "Image",
          fileName,
          naturalWidth,
          naturalHeight,
        },
        width,
        height,
        style: {
          width,
          height,
        },
        selected: true,
      };

      setNodes((currentNodes) => {
        const deselected = currentNodes.map((node) =>
          node.selected ? { ...node, selected: false } : node,
        );
        return [...deselected, newNode];
      });
    },
    [setNodes],
  );

  /** Opens file dialog to select and add an image */
  const handleAddImageFromDialog = useCallback(async () => {
    try {
      const filePath = await window.fileSystem.openFile({
        filters: IMAGE_FILE_FILTERS,
      });
      if (!filePath) {
        return;
      }

      const asset = await registerAssetFromFilePath(filePath);
      const centerPosition = getCanvasCenterPosition();

      await addImageNode(asset.uri, centerPosition, asset.fileName);
    } catch (error) {
      console.error("Failed to add image node", error);
    }
  }, [addImageNode, getCanvasCenterPosition, registerAssetFromFilePath]);

  /** Required to allow dropping files on the canvas */
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  /**
   * Handles dropping image files onto the canvas.
   * - Filters out non-image files.
   * - Places images at drop position.
   * - Offsets multiple images to avoid stacking.
   */
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []).filter(
        isImageFile,
      );

      if (files.length === 0) {
        return;
      }

      setSelectedTool(null);

      const dropPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      files.forEach((file, index) => {
        registerAssetFromFile(file)
          .then((asset) => {
            const offset = index * 24;
            void addImageNode(
              asset.uri,
              { x: dropPosition.x + offset, y: dropPosition.y + offset },
              asset.fileName,
            );
          })
          .catch((error) => {
            console.error("Failed to process dropped image", error);
          });
      });
    },
    [
      addImageNode,
      registerAssetFromFile,
      screenToFlowPosition,
      setSelectedTool,
    ],
  );

  return {
    addImageNode,
    handleAddImageFromDialog,
    handleDragOver,
    handleDrop,
  };
};

export default useCanvasImageNodes;
