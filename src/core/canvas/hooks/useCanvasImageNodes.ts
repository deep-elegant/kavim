import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Node, XYPosition } from '@xyflow/react';

import { IMAGE_NODE_MIN_HEIGHT, IMAGE_NODE_MIN_WIDTH, type ImageNodeType } from '../nodes/ImageNode';
import type { CanvasNode, ToolId } from '../types';

export const IMAGE_FILE_FILTERS = [
  {
    name: 'Images',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'],
  },
];

export const MAX_IMAGE_DIMENSION = 480;

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

export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read file as data URL.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Unable to read file.'));
    };
    reader.readAsDataURL(file);
  });

export const getFileName = (filePath: string) => {
  const segments = filePath.split(/[\/\\]/);
  return segments[segments.length - 1] ?? filePath;
};

export const isImageFile = (file: File) => {
  if (file.type.startsWith('image/')) {
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
}

export const useCanvasImageNodes = ({
  setNodes,
  setSelectedTool,
  screenToFlowPosition,
  getCanvasCenterPosition,
}: UseCanvasImageNodesParams) => {
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

          width = Math.max(IMAGE_NODE_MIN_WIDTH, Math.round(naturalWidth * scale));
          height = Math.max(IMAGE_NODE_MIN_HEIGHT, Math.round(naturalHeight * scale));

          const aspectRatio = naturalWidth / naturalHeight || 1;

          if (height < IMAGE_NODE_MIN_HEIGHT) {
            height = IMAGE_NODE_MIN_HEIGHT;
            width = Math.max(IMAGE_NODE_MIN_WIDTH, Math.round(height * aspectRatio));
          }

          if (width < IMAGE_NODE_MIN_WIDTH) {
            width = IMAGE_NODE_MIN_WIDTH;
            height = Math.max(IMAGE_NODE_MIN_HEIGHT, Math.round(width / aspectRatio));
          }
        }
      } catch (error) {
        console.error('Failed to determine image dimensions', error);
      }

      const nodeId = crypto.randomUUID();
      const newNode: ImageNodeType = {
        id: nodeId,
        type: 'image-node',
        position,
        data: {
          src,
          alt: fileName ?? 'Image',
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

  const handleAddImageFromDialog = useCallback(async () => {
    try {
      const filePath = await window.fileSystem.openFile({ filters: IMAGE_FILE_FILTERS });
      if (!filePath) {
        return;
      }

      const dataUrl = await window.fileSystem.readFileAsDataUrl(filePath);
      const fileName = getFileName(filePath);
      const centerPosition = getCanvasCenterPosition();

      await addImageNode(dataUrl, centerPosition, fileName);
    } catch (error) {
      console.error('Failed to add image node', error);
    }
  }, [addImageNode, getCanvasCenterPosition]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []).filter(isImageFile);

      if (files.length === 0) {
        return;
      }

      setSelectedTool(null);

      const dropPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      files.forEach((file, index) => {
        readFileAsDataUrl(file)
          .then((dataUrl) => {
            const offset = index * 24;
            void addImageNode(
              dataUrl,
              { x: dropPosition.x + offset, y: dropPosition.y + offset },
              file.name,
            );
          })
          .catch((error) => {
            console.error('Failed to read dropped image', error);
          });
      });
    },
    [addImageNode, screenToFlowPosition, setSelectedTool],
  );

  return {
    addImageNode,
    handleAddImageFromDialog,
    handleDragOver,
    handleDrop,
  };
};

export default useCanvasImageNodes;
