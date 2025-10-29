import type { Node } from "@xyflow/react";

import type { TextNodeData } from "../nodes/TextNode";
import type { StickyNoteData } from "../nodes/StickyNoteNode";
import type { ShapeNodeData } from "../nodes/ShapeNode";

/**
 * Strips HTML tags to produce readable plain text from rich text content.
 */
export const htmlToPlainText = (value: string): string =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const TEXTUAL_NODE_TYPES = new Set(["text-node", "sticky-note", "shape-node"]);

/**
 * Formats a summary for textual nodes so they can be referenced elsewhere
 * (AI prompts, history drawers, etc.).
 */
export const formatTextualNodeSummary = (node: Node): string | null => {
  if (!TEXTUAL_NODE_TYPES.has(node.type ?? "")) {
    return null;
  }

  const rawLabel =
    (node.data as
      | (TextNodeData | StickyNoteData | ShapeNodeData | undefined))?.label ??
    "";
  const plainText = htmlToPlainText(rawLabel);

  if (!plainText) {
    return null;
  }

  switch (node.type) {
    case "text-node":
      return `Text node: ${plainText}`;
    case "sticky-note":
      return `Sticky note: ${plainText}`;
    case "shape-node": {
      const { shapeType } = (node.data as ShapeNodeData | undefined) ?? {};
      const shapeLabel = shapeType
        ? `${shapeType.charAt(0).toUpperCase()}${shapeType.slice(1)} shape`
        : "Shape node";
      return `${shapeLabel}: ${plainText}`;
    }
    default:
      return null;
  }
};

