import { describe, expect, it, vi } from "vitest";
import type { Edge, Node } from "@xyflow/react";

import { createAiImageGenerationManager } from "@/core/canvas/utils/aiImageGeneration";
import { type AiNodeData } from "@/core/canvas/nodes/AINode";
import { IMAGE_NODE_MIN_HEIGHT, IMAGE_NODE_MIN_WIDTH } from "@/core/canvas/nodes/ImageNode";
import { type EditableEdgeData } from "@/core/canvas/edges/EditableEdge";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createAiImageGenerationManager", () => {
  const baseAiNode: Node<AiNodeData> = {
    id: "source",
    type: "ai-node",
    position: { x: 0, y: 0 },
    data: { label: "", result: "" },
    width: 360,
    height: 270,
    style: { width: 360, height: 270 },
    selected: false,
    dragging: false,
  };

  it("materializes placeholders with optional owner and repositions nodes", () => {
    let nodes: Node[] = [baseAiNode];
    const setNodes = (updater: (current: Node[]) => Node[]) => {
      nodes = updater(nodes);
    };
    let edges: Edge<EditableEdgeData>[] = [];
    const setEdges = (updater: (current: Edge<EditableEdgeData>[]) => Edge<EditableEdgeData>[]) => {
      edges = updater(edges);
    };

    const manager = createAiImageGenerationManager({
      supportsImageOutput: true,
      isRequestCurrent: () => true,
      getAnchorNode: (currentNodes) =>
        currentNodes.find(
          (node): node is Node<AiNodeData> => node.id === baseAiNode.id && node.type === "ai-node",
        ),
      minimumAnchorWidth: 360,
      horizontalGap: 80,
      setNodes,
      setEdges,
      edgeSourceId: baseAiNode.id,
      edgeSourceHandle: "right-source",
      buildEdgeMetadata: vi.fn(),
      onImageProcessingError: vi.fn(),
    });

    manager.handlePlaceholderBlock({
      type: "image-placeholder",
      asset: { path: "asset-1", uri: "placeholder", fileName: "image.png" },
    });

    expect(nodes).toHaveLength(2);
    const placeholder = nodes.find((node) => node.type === "llm-file-placeholder");
    expect(placeholder).toBeTruthy();
    expect(placeholder?.position).toEqual({ x: 440, y: 0 });
    expect(edges).toHaveLength(0);
  });

  it("converts placeholders to image nodes and links edges with metadata", async () => {
    let nodes: Node[] = [baseAiNode];
    const setNodes = (updater: (current: Node[]) => Node[]) => {
      nodes = updater(nodes);
    };
    let edges: Edge<EditableEdgeData>[] = [];
    const setEdges = (updater: (current: Edge<EditableEdgeData>[]) => Edge<EditableEdgeData>[]) => {
      edges = updater(edges);
    };

    const manager = createAiImageGenerationManager({
      supportsImageOutput: true,
      isRequestCurrent: () => true,
      getAnchorNode: (currentNodes) =>
        currentNodes.find(
          (node): node is Node<AiNodeData> => node.id === baseAiNode.id && node.type === "ai-node",
        ),
      minimumAnchorWidth: 360,
      horizontalGap: 80,
      setNodes,
      setEdges,
      edgeSourceId: baseAiNode.id,
      edgeSourceHandle: "right-source",
      buildEdgeMetadata: () => ({ generatedByNodeId: "source", generatedFromPrompt: "prompt" }),
      onImageProcessingError: vi.fn(),
      resolveImageSize: vi.fn().mockResolvedValue({
        width: IMAGE_NODE_MIN_WIDTH + 20,
        height: IMAGE_NODE_MIN_HEIGHT + 10,
        naturalWidth: 500,
        naturalHeight: 400,
      }),
    });

    manager.handlePlaceholderBlock({
      type: "image-placeholder",
      asset: { path: "asset-2", uri: "placeholder", fileName: "image.png" },
    });

    manager.handleImageBlock({
      type: "image",
      asset: { path: "asset-2", uri: "image://uri", fileName: "image.png" },
      alt: "description",
    });

    await flushPromises();

    const imageNode = nodes.find((node) => node.type === "image-node");
    expect(imageNode).toBeTruthy();
    expect(imageNode?.position).toEqual({ x: 440, y: 0 });
    expect(imageNode?.width).toBe(IMAGE_NODE_MIN_WIDTH + 20);
    expect((imageNode?.data as { src?: string }).src).toBe("image://uri");

    expect(edges).toHaveLength(1);
    const [edge] = edges;
    expect(edge?.source).toBe("source");
    expect(edge?.target).toBe(imageNode?.id);
    expect(edge?.data?.metadata).toEqual({
      generatedByNodeId: "source",
      generatedFromPrompt: "prompt",
    });
  });

  it("skips updates when the request is no longer current", async () => {
    let nodes: Node[] = [baseAiNode];
    const setNodes = (updater: (current: Node[]) => Node[]) => {
      nodes = updater(nodes);
    };
    let edges: Edge<EditableEdgeData>[] = [];
    const setEdges = (updater: (current: Edge<EditableEdgeData>[]) => Edge<EditableEdgeData>[]) => {
      edges = updater(edges);
    };

    let isCurrent = true;
    const manager = createAiImageGenerationManager({
      supportsImageOutput: true,
      isRequestCurrent: () => isCurrent,
      getAnchorNode: (currentNodes) =>
        currentNodes.find(
          (node): node is Node<AiNodeData> => node.id === baseAiNode.id && node.type === "ai-node",
        ),
      minimumAnchorWidth: 360,
      horizontalGap: 80,
      setNodes,
      setEdges,
      edgeSourceId: baseAiNode.id,
      onImageProcessingError: vi.fn(),
    });

    manager.handlePlaceholderBlock({
      type: "image-placeholder",
      asset: { path: "asset-3", uri: "placeholder", fileName: "image.png" },
    });

    isCurrent = false;
    manager.handleImageBlock({
      type: "image",
      asset: { path: "asset-3", uri: "image://uri", fileName: "image.png" },
    });

    await flushPromises();

    expect(nodes.find((node) => node.type === "image-node")).toBeUndefined();
    expect(edges).toHaveLength(0);
  });
});
