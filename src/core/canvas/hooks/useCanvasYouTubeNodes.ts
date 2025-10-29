import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Node, XYPosition } from "@xyflow/react";

import {
  YOUTUBE_NODE_MIN_HEIGHT,
  YOUTUBE_NODE_MIN_WIDTH,
  type YouTubeNodeType,
} from "../nodes/YouTubeNode";
import type { CanvasNode, ToolId } from "../types";

/**
 * Parameters for the useCanvasYouTubeNodes hook.
 */
export interface UseCanvasYouTubeNodesParams {
  /** Function to get the center position of the canvas in flow coordinates. */
  getCanvasCenterPosition: () => XYPosition;
  /** React setter for the array of nodes on the canvas. */
  setNodes: Dispatch<SetStateAction<Node<CanvasNode>[]>>;
  /** React setter for the currently selected tool. */
  setSelectedTool: Dispatch<SetStateAction<ToolId | null>>;
  /** Function to perform an undoable action on the canvas state. */
  performAction: <T>(mutator: () => T, label?: string) => T;
}

/**
 * A hook for managing YouTube video nodes on the canvas.
 * Provides functionality to add new YouTube nodes.
 */
export const useCanvasYouTubeNodes = ({
  getCanvasCenterPosition,
  setNodes,
  setSelectedTool,
  performAction,
}: UseCanvasYouTubeNodesParams) => {
  /**
   * Adds a new YouTube video node to the canvas.
   * The node is placed in the center of the visible canvas area.
   * @param videoId - The ID of the YouTube video.
   * @param url - The URL of the YouTube video.
   */
  const addYouTubeNode = useCallback(
    (videoId: string, url: string) => {
      const center = getCanvasCenterPosition();
      const width = YOUTUBE_NODE_MIN_WIDTH;
      const height = YOUTUBE_NODE_MIN_HEIGHT;
      // Calculate the position to center the new node on the canvas
      const position = {
        x: center.x - width / 2,
        y: center.y - height / 2,
      };
      const nodeId = crypto.randomUUID();
      const newNode: YouTubeNodeType = {
        id: nodeId,
        type: "youtube-node",
        position,
        data: { videoId, url },
        width,
        height,
        style: { width, height },
        selected: true,
      };

      setSelectedTool(null); // Deselect any active tool after adding the node

      performAction(() => {
        setNodes((currentNodes) => {
          // Deselect all other nodes and add the new YouTube node
          const deselected = currentNodes.map((node) =>
            node.selected ? { ...node, selected: false } : node,
          );
          return [...deselected, newNode];
        });
      }, "add-youtube-node");
    },
    [
      getCanvasCenterPosition,
      performAction,
      setNodes,
      setSelectedTool,
    ],
  );

  return { addYouTubeNode };
};

export default useCanvasYouTubeNodes;
