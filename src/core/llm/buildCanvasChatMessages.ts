import { marked } from "marked";
import type { Edge, Node } from "@xyflow/react";

import type { ChatMessage } from "@/core/llm/chatTypes";
import { formatTextualNodeSummary, htmlToPlainText } from "@/core/canvas/utils/text";
import type { AiNodeData } from "@/core/canvas/nodes/AINode";
import type { ImageNodeData } from "@/core/canvas/nodes/ImageNode";

export type BuildCanvasChatMessagesParams<TEdgeData = unknown> = {
  nodes: Node[];
  edges: Edge<TEdgeData>[];
  targetNodeId: string;
  promptText: string;
  supportsTextInput: boolean;
  supportsImageInput: boolean;
  contextNodes?: Node[];
  allowedAncestorNodeIds?: Set<string>;
};

export type BuildCanvasChatMessagesResult = {
  messages: ChatMessage[];
  hasUsableInput: boolean;
};

export const buildCanvasChatMessages = <TEdgeData = unknown>(
  params: BuildCanvasChatMessagesParams<TEdgeData>,
): BuildCanvasChatMessagesResult => {
  const {
    nodes,
    edges,
    targetNodeId,
    promptText,
    supportsTextInput,
    supportsImageInput,
    contextNodes,
    allowedAncestorNodeIds,
  } = params;

  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));

  const incomingMap = new Map<string, Edge<TEdgeData>[]>();
  for (const edge of edges) {
    const target = edge.target;
    if (!target) {
      continue;
    }

    const bucket = incomingMap.get(target);
    if (bucket) {
      bucket.push(edge);
    } else {
      incomingMap.set(target, [edge]);
    }
  }

  const collectImagePartsForNode = (
    nodeId: string,
  ): ChatMessage["content"] => {
    if (!supportsImageInput) {
      return [];
    }

    const incomingEdges = incomingMap.get(nodeId) ?? [];
    const attachments: ChatMessage["content"] = [];
    const seen = new Set<string>();

    for (const edge of incomingEdges) {
      const metadata = (edge.data as { metadata?: { generatedByNodeId?: string } } | undefined)
        ?.metadata;
      if (metadata?.generatedByNodeId === nodeId) {
        continue;
      }

      const sourceId = edge.source;
      if (typeof sourceId !== "string") {
        continue;
      }

      const sourceNode = nodeMap.get(sourceId);
      if (!sourceNode || sourceNode.type !== "image-node") {
        continue;
      }

      const imageData = sourceNode.data as ImageNodeData | undefined;
      const assetPath = imageData?.src;
      if (!assetPath || seen.has(assetPath)) {
        continue;
      }

      seen.add(assetPath);
      const altCandidate = imageData?.alt?.trim() || imageData?.fileName?.trim();
      attachments.push({
        type: "image",
        assetPath,
        ...(altCandidate ? { alt: altCandidate } : {}),
      });
    }

    return attachments;
  };

  const visited = new Set<string>();
  const collectFromNode = (nodeId: string): ChatMessage[] => {
    if (visited.has(nodeId)) {
      return [];
    }

    if (
      allowedAncestorNodeIds &&
      !allowedAncestorNodeIds.has(nodeId)
    ) {
      return [];
    }

    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node || node.type !== "ai-node") {
      return [];
    }

    const messagesBefore = (incomingMap.get(nodeId) ?? []).flatMap((incomingEdge) => {
      const sourceId = incomingEdge.source;
      if (typeof sourceId !== "string") {
        return [];
      }

      return collectFromNode(sourceId);
    });

    const nodeData = node.data as AiNodeData | undefined;
    const promptPlainText = htmlToPlainText(nodeData?.label ?? "");
    const resultMarkdown = nodeData?.result ?? "";
    const resultText = resultMarkdown
      ? htmlToPlainText(marked.parse(resultMarkdown) as string)
      : "";

    const messages: ChatMessage[] = [];
    if (promptPlainText.trim().length > 0) {
      messages.push({
        role: "user",
        content: [{ type: "text", text: promptPlainText }],
      });
    }

    if (resultText.trim().length > 0) {
      messages.push({
        role: "assistant",
        content: [{ type: "text", text: resultText }],
      });
    }

    return [...messagesBefore, ...messages];
  };

  const history: ChatMessage[] = [];
  const contextSource = contextNodes ?? nodes;
  const textualContextEntries = contextSource
    .map((node) => formatTextualNodeSummary(node))
    .filter((entry): entry is string => Boolean(entry));

  if (textualContextEntries.length > 0) {
    history.push({
      role: "system",
      content: [
        {
          type: "text",
          text: `Canvas context:\n${textualContextEntries
            .map((entry) => `- ${entry}`)
            .join("\n")}`,
        },
      ],
    });
  }

  const aiHistory = (incomingMap.get(targetNodeId) ?? []).flatMap((edge) => {
    const sourceId = edge.source;
    if (typeof sourceId !== "string") {
      return [];
    }

    return collectFromNode(sourceId);
  });
  history.push(...aiHistory);

  const promptParts: ChatMessage["content"] = collectImagePartsForNode(targetNodeId);
  if (supportsTextInput) {
    const trimmedPrompt = promptText.trim();
    if (trimmedPrompt.length > 0) {
      promptParts.unshift({ type: "text", text: trimmedPrompt });
    }
  }

  const hasUsableInput = promptParts.some((part) => {
    if (part.type === "image") {
      return true;
    }

    return part.text.trim().length > 0;
  });

  if (hasUsableInput) {
    history.push({
      role: "user",
      content: promptParts,
    });
  }

  return {
    messages: history,
    hasUsableInput,
  };
};
