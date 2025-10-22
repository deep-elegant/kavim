import type { StickyNoteNodeType } from "./nodes/StickyNoteNode";
import type { ShapeNode } from "./nodes/ShapeNode";
import type { TextNode } from "./nodes/TextNode";
import type { AiNodeType } from "./nodes/AINode";
import type { ImageNodeType } from "./nodes/ImageNode";

export type ToolId =
  | "sticky-note"
  | "shape"
  | "arrow"
  | "prompt-node"
  | "text"
  | "image";

export type CanvasNode =
  | StickyNoteNodeType
  | ShapeNode
  | TextNode
  | AiNodeType
  | ImageNodeType;
