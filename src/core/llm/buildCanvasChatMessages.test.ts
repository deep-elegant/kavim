import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";

import { buildCanvasChatMessages } from "./buildCanvasChatMessages";
import type { AiNodeData } from "@/core/canvas/nodes/AINode";
import type { ImageNodeData } from "@/core/canvas/nodes/ImageNode";

describe("buildCanvasChatMessages", () => {
  const createAiNode = (
    id: string,
    data: Partial<AiNodeData>,
  ): Node => ({
    id,
    type: "ai-node",
    position: { x: 0, y: 0 },
    data: data as AiNodeData,
  });

  const createImageNode = (
    id: string,
    data: Partial<ImageNodeData>,
  ): Node => ({
    id,
    type: "image-node",
    position: { x: 0, y: 0 },
    data: data as ImageNodeData,
  });

  const createEdge = (
    id: string,
    source: string,
    target: string,
    metadata: Record<string, unknown> = {},
  ): Edge => ({
    id,
    source,
    target,
    type: "editable",
    data: { metadata },
  });

  it("combines ancestor prompts/responses with the new user input", () => {
    const parent = createAiNode("parent", {
      label: "<p>Parent prompt</p>",
      result: "**Parent response**",
    });
    const target = createAiNode("target", {
      label: "",
      result: "",
    });

    const { messages, hasUsableInput } = buildCanvasChatMessages({
      nodes: [parent, target],
      edges: [createEdge("edge-1", "parent", "target")],
      targetNodeId: "target",
      promptText: "Follow up",
      supportsTextInput: true,
      supportsImageInput: false,
      contextNodes: [],
      allowedAncestorNodeIds: new Set(["parent"]),
    });

    expect(hasUsableInput).toBe(true);
    expect(messages).toMatchObject([
      {
        role: "user",
        content: [{ type: "text", text: "Parent prompt" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Parent response" }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "Follow up" }],
      },
    ]);
  });

  it("attaches upstream images when the model supports image input", () => {
    const imageNode = createImageNode("image", {
      src: "pak://assets/example.png",
      alt: "diagram",
    });
    const target = createAiNode("target", {});

    const { messages, hasUsableInput } = buildCanvasChatMessages({
      nodes: [target, imageNode],
      edges: [createEdge("edge-1", "image", "target")],
      targetNodeId: "target",
      promptText: "",
      supportsTextInput: false,
      supportsImageInput: true,
      contextNodes: [],
    });

    expect(hasUsableInput).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: [
        {
          type: "image",
          assetPath: "assets/example.png",
          alt: "diagram",
        },
      ],
    });
  });

  it("returns unusable input when no text or image data is available", () => {
    const target = createAiNode("target", {});

    const result = buildCanvasChatMessages({
      nodes: [target],
      edges: [],
      targetNodeId: "target",
      promptText: "   ",
      supportsTextInput: true,
      supportsImageInput: true,
      contextNodes: [],
    });

    expect(result.hasUsableInput).toBe(false);
    expect(result.messages).toHaveLength(0);
  });
});
