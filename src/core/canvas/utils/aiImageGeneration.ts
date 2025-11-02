import { type Edge, type Node } from "@xyflow/react";

import {
  IMAGE_NODE_MIN_HEIGHT,
  IMAGE_NODE_MIN_WIDTH,
  type ImageNodeType,
} from "../nodes/ImageNode";
import type { LlmFilePlaceholderNodeType } from "../nodes/LlmFilePlaceholderNode";
import {
  AI_IMAGE_VERTICAL_GAP,
  computeImageDisplaySize,
} from "../nodes/aiImageUtils";
import {
  createDefaultEditableEdgeData,
  type EditableEdgeData,
} from "../edges/EditableEdge";

export type ImageBlock = {
  type: "image";
  asset: {
    path: string;
    uri: string;
    fileName: string;
  };
  alt?: string;
};

type NodesUpdater = (updater: (nodes: Node[]) => Node[]) => void;
type EdgesUpdater = (
  updater: (edges: Edge<EditableEdgeData>[]) => Edge<EditableEdgeData>[],
) => void;

type EdgeMetadataBuilder = (context: {
  nodeId: string;
}) => EditableEdgeData["metadata"];

type AnchorNodeResolver = (nodes: Node[]) => Node | undefined;

type ImageSizeResolver = (uri: string) => Promise<{
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}>;

export type AiImageGenerationManagerOptions = {
  supportsImageOutput: boolean;
  /**
   * Determines if the current async request is still active. Returning false aborts updates.
   */
  isRequestCurrent: () => boolean;
  /** Resolves the node used as the horizontal anchor for generated images. */
  getAnchorNode: AnchorNodeResolver;
  /** Minimum width to assume for the anchor node when positioning generated nodes. */
  minimumAnchorWidth: number;
  /** Horizontal gap between the anchor node and generated image nodes. */
  horizontalGap: number;
  /** Optional vertical gap override. Defaults to AI_IMAGE_VERTICAL_GAP. */
  verticalGap?: number;
  /** React Flow setter for nodes. */
  setNodes: NodesUpdater;
  /** React Flow setter for edges. */
  setEdges: EdgesUpdater;
  /** Node ID used as the edge source when linking generated images. */
  edgeSourceId: string;
  /** Optional source handle identifier for generated edges. */
  edgeSourceHandle?: string;
  /** Optional target handle identifier for generated edges. Defaults to "left-target". */
  edgeTargetHandle?: string;
  /** Builds optional metadata stored on generated edges. */
  buildEdgeMetadata?: EdgeMetadataBuilder;
  /** Invoked when image materialization fails. */
  onImageProcessingError: (error: unknown) => void;
  /** Optional override for computing display dimensions. */
  resolveImageSize?: ImageSizeResolver;
};

export type AiImageGenerationManager = {
  reset: () => void;
  handlePlaceholderBlock: () => void;
  handleImageBlock: (block: ImageBlock) => void;
};

/**
 * Creates a manager responsible for materializing AI streaming image blocks into canvas nodes.
 * - Maintains stable ordering of generated assets across progress updates.
 * - Converts placeholders into final image nodes once the asset URI is available.
 * - Links generated images back to the originating AI node while avoiding duplicate edges.
 */
export const createAiImageGenerationManager = (
  options: AiImageGenerationManagerOptions,
): AiImageGenerationManager => {
  let assetNodeIds = new Map<string, string>();
  let imageAssetOrder: string[] = [];
  let imageProcessingQueue: Promise<void> = Promise.resolve();
  let placeholderNodeRef: LlmFilePlaceholderNodeType | undefined;

  const resolveImageSize = options.resolveImageSize ?? computeImageDisplaySize;
  const verticalGap = options.verticalGap ?? AI_IMAGE_VERTICAL_GAP;

  const reset = () => {
    assetNodeIds = new Map();
    imageAssetOrder = [];
    imageProcessingQueue = Promise.resolve();
  };

  const repositionGeneratedNodes = (nodes: Node[]): Node[] => {
    const anchorNode = options.getAnchorNode(nodes);

    if (!anchorNode) {
      return nodes;
    }

    const anchorWidth = Math.max(
      options.minimumAnchorWidth,
      Number(
        anchorNode.style?.width ??
          anchorNode.width ??
          options.minimumAnchorWidth,
      ),
    );

    let yOffset = 0;
    const targetPositions = new Map<string, { x: number; y: number }>();

    const nodeId = placeholderNodeRef!.id;

    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return nodes;
    }

    const height = Math.max(
      IMAGE_NODE_MIN_HEIGHT,
      Number(node.style?.height ?? node.height ?? IMAGE_NODE_MIN_HEIGHT),
    );

    targetPositions.set(nodeId, {
      x: anchorNode.position.x + anchorWidth + options.horizontalGap,
      y: anchorNode.position.y + yOffset,
    });

    yOffset += height + verticalGap;

    if (targetPositions.size === 0) {
      return nodes;
    }

    return nodes.map((node) => {
      const position = targetPositions.get(node.id);

      if (!position) {
        return node;
      }

      if (node.position.x === position.x && node.position.y === position.y) {
        return node;
      }

      return {
        ...node,
        position,
      };
    });
  };

  const handlePlaceholderBlock = () => {
    if (!options.supportsImageOutput) {
      return;
    }

    // Optimistic ui - when generating image node - it create a placeholder node (showing loading state)
    const nodeId = crypto.randomUUID();

    options.setNodes((nodes) => {
      if (!options.isRequestCurrent()) {
        return nodes;
      }

      const placeholderData: LlmFilePlaceholderNodeType["data"] = {
        alt: "",
      };

      const placeholderNode: LlmFilePlaceholderNodeType = {
        id: nodeId,
        type: "llm-file-placeholder",
        position: { x: 0, y: 0 },
        data: placeholderData,
        width: IMAGE_NODE_MIN_WIDTH,
        height: IMAGE_NODE_MIN_HEIGHT,
        style: {
          width: IMAGE_NODE_MIN_WIDTH,
          height: IMAGE_NODE_MIN_HEIGHT,
        },
        selected: false,
      };

      placeholderNodeRef = placeholderNode;
      const nextNodes = [...nodes, placeholderNode];
      return repositionGeneratedNodes(nextNodes);
    });

    options.setEdges((edges) => {
      if (!options.isRequestCurrent()) {
        return edges;
      }

      const hasEdge = edges.some(
        (edge) =>
          edge.source === options.edgeSourceId && edge.target === nodeId,
      );

      if (hasEdge) {
        return edges;
      }

      const edgeData = {
        ...createDefaultEditableEdgeData(),
        targetMarker: "arrow",
      } satisfies EditableEdgeData;

      const metadata = options.buildEdgeMetadata?.({ nodeId });
      if (metadata) {
        edgeData.metadata = metadata;
      }

      const edge: Edge<EditableEdgeData> = {
        id: crypto.randomUUID(),
        source: options.edgeSourceId,
        target: nodeId,
        type: "editable",
        data: edgeData,
        targetHandle: options.edgeTargetHandle ?? "left-target",
      };

      if (options.edgeSourceHandle) {
        edge.sourceHandle = options.edgeSourceHandle;
      }

      return [...edges, edge];
    });
  };

  const handleImageBlock = (block: ImageBlock) => {
    if (!options.supportsImageOutput) {
      return;
    }

    const nodeId = placeholderNodeRef!.id;

    if (!nodeId) {
      return;
    }

    const processImage = async () => {
      if (!options.isRequestCurrent()) {
        return;
      }

      try {
        const { width, height, naturalWidth, naturalHeight } =
          await resolveImageSize(block.asset.uri);

        if (!options.isRequestCurrent()) {
          return;
        }

        options.setNodes((nodes) => {
          if (!options.isRequestCurrent()) {
            return nodes;
          }

          const nextNodes = nodes.map((node) => {
            if (node.id !== nodeId) {
              return node;
            }

            const imageNode: ImageNodeType = {
              id: nodeId,
              type: "image-node",
              position: node.position,
              data: {
                src: block.asset.uri,
                alt: block.alt ?? undefined,
                fileName: block.asset.fileName,
                naturalWidth,
                naturalHeight,
                assetOrigin: "local",
              },
              width,
              height,
              style: { width, height },
              selected: false,
            };

            return imageNode;
          });

          return repositionGeneratedNodes(nextNodes);
        });

        if (!options.isRequestCurrent()) {
          return;
        }
      } catch (error) {

        // Remove placeholder node
        options.setNodes((nodes) => {
          return nodes.filter((node) => node.id !== nodeId);
        });

        // Remove placeholder edge
        options.setEdges((edges) => {
          return edges.filter((edge) => edge.target !== nodeId);
        });

        options.onImageProcessingError(error);
      }
    };

    imageProcessingQueue = imageProcessingQueue
      .then(() => processImage())
      .catch((error) => {
        options.onImageProcessingError(error);
      });
  };

  return {
    reset,
    handlePlaceholderBlock,
    handleImageBlock,
  };
};
