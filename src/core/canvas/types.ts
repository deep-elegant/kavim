import type { StickyNoteNodeType } from "./nodes/StickyNoteNode";
import type { ShapeNode } from "./nodes/ShapeNode";
import type { TextNode } from "./nodes/TextNode";
import type { AiNodeType } from "./nodes/AINode";
import type { ImageNodeType } from "./nodes/ImageNode";
import type { LlmFilePlaceholderNodeType } from "./nodes/LlmFilePlaceholderNode";
import type { YouTubeNodeType } from "./nodes/YouTubeNode"; // Type for YouTube video nodes

export type ToolId =
  | "sticky-note"
  | "shape"
  | "arrow"
  | "prompt-node"
  | "text"
  | "image"
  | "youtube"; // Tool for embedding YouTube videos

export type CanvasNode =
  | StickyNoteNodeType
  | ShapeNode
  | TextNode
  | AiNodeType
  | LlmFilePlaceholderNodeType
  | ImageNodeType
  | YouTubeNodeType; // Represents a YouTube video node
