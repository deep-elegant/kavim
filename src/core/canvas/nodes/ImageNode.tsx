import React, { memo } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';

import NodeInteractionOverlay from './NodeInteractionOverlay';

/** Data structure for image nodes on the canvas */
export type ImageNodeData = {
  src: string;
  alt?: string;
  fileName?: string;
  /** Original image dimensions (used for aspect ratio calculations) */
  naturalWidth?: number;
  naturalHeight?: number;
};

export type ImageNodeType = Node<ImageNodeData, 'image-node'>;

export const IMAGE_NODE_MIN_WIDTH = 120;
export const IMAGE_NODE_MIN_HEIGHT = 120;

/**
 * Displays an image on the canvas with optional filename overlay.
 * - Uses object-contain to preserve aspect ratio.
 * - Shows filename badge at bottom when available.
 * - Lazy loads images for performance with many nodes.
 */
const ImageNode = memo(({ id, data, selected }: NodeProps<ImageNodeType>) => {
  const { src, alt, fileName } = data;

  return (
    <NodeInteractionOverlay
      nodeId={id}
      isActive={selected}
      minWidth={IMAGE_NODE_MIN_WIDTH}
      minHeight={IMAGE_NODE_MIN_HEIGHT}
      contextMenuItems={undefined}
    >
      <div className="relative h-full w-full overflow-hidden rounded-lg border border-border bg-background">
        {src ? (
          <img
            src={src}
            alt={alt ?? fileName ?? 'Canvas image'}
            className="h-full w-full select-none object-contain"
            draggable={false}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}

        {/* Show filename badge when available (helps identify images in complex canvases) */}
        {fileName ? (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
            {fileName}
          </div>
        ) : null}
      </div>
    </NodeInteractionOverlay>
  );
});

ImageNode.displayName = 'ImageNode';

export default ImageNode;
