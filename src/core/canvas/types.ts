import type { StickyNoteNodeType } from "./nodes/StickyNoteNode";
import type { ShapeNode } from "./nodes/ShapeNode";
import type { TextNode } from "./nodes/TextNode";
import type { AiNodeType } from "./nodes/AINode";
import type { ImageNodeType } from "./nodes/ImageNode";
import type { LlmFilePlaceholderNodeType } from "./nodes/LlmFilePlaceholderNode";
import type { YouTubeNodeType } from "./nodes/YouTubeNode"; // Type for YouTube video nodes
import type { FrameNodeType } from "./nodes/FrameNode";
import { createContext, useContext } from "react";
import { XYPosition } from "@xyflow/react";

export type ToolId =
  | "sticky-note"
  | "shape"
  | "arrow"
  | "prompt-node"
  | "text"
  | "frame"
  | "image"
  | "youtube"; // Tool for embedding YouTube videos

export type CanvasNode =
  | StickyNoteNodeType
  | ShapeNode
  | TextNode
  | AiNodeType
  | LlmFilePlaceholderNodeType
  | ImageNodeType
  | YouTubeNodeType
  | FrameNodeType; // Represents a frame/container node

export type CanvasActionsContextType = {
  addImageFromDialog: (
    position?: XYPosition,
  ) => Promise<ImageNodeType | undefined>;
};

export const CanvasActionsContext =
  createContext<CanvasActionsContextType | null>(null);

export const useCanvasActions = () => {
  const context = useContext(CanvasActionsContext);
  if (!context) {
    throw new Error(
      "useCanvasActions must be used within a CanvasActionsProvider",
    );
  }
  return context;
};
