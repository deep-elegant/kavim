import type { Node } from "@xyflow/react";

import type { TextNodeData } from "../nodes/TextNode";
import type { StickyNoteData } from "../nodes/StickyNoteNode";
import type { ShapeNodeData } from "../nodes/ShapeNode";

/**
 * Strips HTML tags from a string to produce readable plain text.
 * @param value - The HTML string to convert.
 * @returns The plain text string.
 */
export const htmlToPlainText = (value: string): string =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const TEXTUAL_NODE_TYPES = new Set(["text-node", "sticky-note", "shape-node"]);

/**
 * Formats a summary for textual nodes so they can be referenced elsewhere (e.g., in AI prompts or history drawers).
 * @param node - The node to summarize.
 * @returns A string summary, or null if the node is not a supported textual type.
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
    case "sticky-note":
    case "shape-node":
      return `${plainText}`;
    default:
      return null;
  }
};
