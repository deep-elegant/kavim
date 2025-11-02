import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Edge, Node } from "@xyflow/react";
import { toast } from "sonner";
import { marked } from "marked";

import { useCanvasData } from "../CanvasDataContext";
import { useCanvasUndoRedo } from "../undo";
import {
  createDefaultEditableEdgeData,
  type EditableEdgeData,
} from "../edges/EditableEdge";
import type { AiNodeData } from "../nodes/AINode";
import type { TextNodeData } from "../nodes/TextNode";
import type { StickyNoteData } from "../nodes/StickyNoteNode";
import type { ShapeNodeData } from "../nodes/ShapeNode";
import { type ImageNodeData } from "../nodes/ImageNode";
import type { YouTubeNodeData } from "../nodes/YouTubeNode";
import { formatTextualNodeSummary, htmlToPlainText } from "../utils/text";
import { AI_MODELS, type AiModel } from "@/core/llm/aiModels";
import { generateAiResult } from "@/core/llm/generateAiResult";
import { createAiImageGenerationManager } from "../utils/aiImageGeneration";
import { buildCanvasChatMessages } from "@/core/llm/buildCanvasChatMessages";

export type LinearHistoryItem = {
  id: string;
  type?: string;
  title: string;
  summary?: string | null;
  prompt?: string | null;
  response?: string | null;
  imageSrc?: string | null;
  imageAlt?: string | null;
};

type LinearHistoryContextValue = {
  isOpen: boolean;
  activeNodeId: string | null;
  items: LinearHistoryItem[];
  isCycleTruncated: boolean;
  open: (nodeId: string) => void;
  close: () => void;
  sendPrompt: (payload: { model: AiModel; prompt: string }) => Promise<void>;
};

const LinearHistoryContext = createContext<LinearHistoryContextValue | undefined>(
  undefined,
);

// Traverses the graph of nodes and edges to derive a linear history from a given active node.
const deriveLinearHistoryPath = (
  activeNodeId: string,
  nodes: Node[],
  edges: Edge<EditableEdgeData>[],
) => {
  // Create a map of nodes for efficient lookup.
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  // A set to keep track of visited nodes to detect cycles.
  const visited = new Set<string>();
  // The ordered list of nodes in the history path.
  const ordered: Node[] = [];
  let currentId: string | undefined = activeNodeId;
  // A flag to indicate if a cycle was detected and the history was truncated.
  let isCycleTruncated = false;

  // Traverse the graph backwards from the active node, following the incoming edges.
  while (currentId) {
    // If we encounter a node we have already visited, we have a cycle.
    if (visited.has(currentId)) {
      isCycleTruncated = true;
      break;
    }

    visited.add(currentId);
    const node = nodeMap.get(currentId);
    if (!node) {
      break;
    }
    ordered.push(node);

    // Find the parent of the current node.
    let parentId: string | undefined;
    for (const edge of edges) {
      if (edge.target === currentId) {
        parentId = edge.source;
        break;
      }
    }

    // If there is no parent, we have reached the beginning of the path.
    if (!parentId) {
      break;
    }

    currentId = parentId;
  }

  // The nodes are added in reverse order, so we reverse them back to the correct order.
  return {
    nodes: ordered.reverse(),
    isCycleTruncated,
  };
};

const AI_NODE_DEFAULT_WIDTH = 360;
const AI_NODE_DEFAULT_HEIGHT = 270;
const AI_NODE_HORIZONTAL_GAP = 80;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const convertPromptToHtml = (prompt: string) =>
  prompt
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("") || "<p></p>";

// Creates a `LinearHistoryItem` from a `Node`, summarizing its content for display in the history view.
const summarizeNodeForHistory = (node: Node): LinearHistoryItem => {
  const type = node.type;

  switch (type) {
    case "ai-node": {
      const data = (node.data as Partial<AiNodeData> | undefined) ?? {};
      const prompt = htmlToPlainText(data.label ?? "");
      const responseMarkdown = data.result ?? "";
      const responsePlainText = responseMarkdown
        ? htmlToPlainText(marked.parse(responseMarkdown))
        : "";
      const modelLabel = data.model ? `AI (${data.model})` : "AI Node";

      return {
        id: node.id,
        type,
        title: modelLabel,
        summary: null,
        prompt: prompt || null,
        response: responsePlainText || null,
      } satisfies LinearHistoryItem;
    }
    case "text-node": {
      const data = (node.data as Partial<TextNodeData> | undefined) ?? {};
      const summary = htmlToPlainText(data.label ?? "");
      return {
        id: node.id,
        type,
        title: "Text node",
        summary: summary || null,
      } satisfies LinearHistoryItem;
    }
    case "sticky-note": {
      const data = (node.data as Partial<StickyNoteData> | undefined) ?? {};
      const summary = htmlToPlainText(data.label ?? "");
      return {
        id: node.id,
        type,
        title: "Sticky note",
        summary: summary || null,
      } satisfies LinearHistoryItem;
    }
    case "shape-node": {
      const data = (node.data as Partial<ShapeNodeData> | undefined) ?? {};
      const summary = htmlToPlainText(data.label ?? "");
      const shapeLabel = data.shapeType
        ? `${data.shapeType.charAt(0).toUpperCase()}${data.shapeType.slice(1)} shape`
        : "Shape";
      return {
        id: node.id,
        type,
        title: shapeLabel,
        summary: summary || null,
      } satisfies LinearHistoryItem;
    }
    case "image-node": {
      const data = (node.data as Partial<ImageNodeData> | undefined) ?? {};
      const descriptor = data.fileName ?? data.alt ?? data.src ?? "";
      const imageSrc = data.src ?? null;
      const imageAlt = data.alt ?? data.fileName ?? null;
      return {
        id: node.id,
        type,
        title: "Image",
        summary: descriptor || null,
        imageSrc,
        imageAlt,
      } satisfies LinearHistoryItem;
    }
    case "youtube-node": {
      const data = (node.data as Partial<YouTubeNodeData> | undefined) ?? {};
      const descriptor = data.title ?? data.url ?? data.videoId ?? "";
      return {
        id: node.id,
        type,
        title: "YouTube video",
        summary: descriptor || null,
      } satisfies LinearHistoryItem;
    }
    default:
      return {
        id: node.id,
        type,
        title: node.type ?? "Node",
        summary: null,
      } satisfies LinearHistoryItem;
  }
};

/**
 * Provides a linear history of the canvas, which is a sequence of connected nodes.
 * It allows the user to view the history of a node, send prompts to an AI model, and update the canvas with the results.
 * @param children - The child components to render.
 */
export const LinearHistoryProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { nodes, edges, setNodes, setEdges, getNodes, getEdges } =
    useCanvasData();
  const { performAction } = useCanvasUndoRedo();
  const [state, setState] = useState<{
    isOpen: boolean;
    activeNodeId: string | null;
  }>({
    isOpen: false,
    activeNodeId: null,
  });
  const requestIdRef = useRef(0);

  const open = useCallback((nodeId: string) => {
    setState({
      isOpen: true,
      activeNodeId: nodeId,
    });
  }, []);

  const close = useCallback(() => {
    setState({ isOpen: false, activeNodeId: null });
  }, []);

  // This effect ensures that if the active node is deleted, the history view is closed.
  useEffect(() => {
    if (!state.isOpen || !state.activeNodeId) {
      return;
    }

    const exists = nodes.some((node) => node.id === state.activeNodeId);
    if (!exists) {
      setState({ isOpen: false, activeNodeId: null });
    }
  }, [nodes, state.activeNodeId, state.isOpen]);

  // Sends a prompt to the AI model and updates the canvas with the results.
  const sendPrompt = useCallback(
    async ({ model, prompt }: { model: AiModel; prompt: string }) => {
      const activeNodeId = state.activeNodeId;
      const trimmedPrompt = prompt.trim();
      const resolvedModel = AI_MODELS.find((option) => option.value === model);
      const modelInputCapabilities = resolvedModel?.capabilities?.input ?? [
        "text",
      ];
      const modelOutputCapabilities =
        resolvedModel?.capabilities?.output ?? ["text"];
      const supportsTextInput = modelInputCapabilities.includes("text");
      const supportsImageInput = modelInputCapabilities.includes("image");
      const supportsImageOutput = modelOutputCapabilities.includes("image");

      if (!activeNodeId || (!supportsImageInput && trimmedPrompt.length === 0)) {
        return;
      }

      // Get the current state of the canvas.
      const flowNodes = getNodes();
      const flowEdges = getEdges();
      // Derive the linear history path for the active node.
      const { nodes: pathNodes } = deriveLinearHistoryPath(
        activeNodeId,
        flowNodes,
        flowEdges,
      );

      if (pathNodes.length === 0) {
        return;
      }

      // The source node is the last node in the path.
      const sourceNode = pathNodes[pathNodes.length - 1]!;
      const sourceNodeData = sourceNode.data as AiNodeData | undefined;
      const sourcePromptText =
        sourceNode.type === "ai-node"
          ? htmlToPlainText(sourceNodeData?.label ?? "").trim()
          : "";
      const sourceResponseText =
        sourceNode.type === "ai-node"
          ? (sourceNodeData?.result ?? "").trim()
          : "";
      // If the source node is an empty AI node, we can reuse it.
      const shouldReuseActive =
        sourceNode.type === "ai-node" &&
        sourcePromptText.length === 0 &&
        sourceResponseText.length === 0;

      const sourceWidth = Number(
        sourceNode.width ?? sourceNode.style?.width ?? AI_NODE_DEFAULT_WIDTH,
      );
      // If we are not reusing the active node, create a new node ID.
      const targetNodeId = shouldReuseActive
        ? sourceNode.id
        : crypto.randomUUID();
      const promptHtml = convertPromptToHtml(trimmedPrompt);

      let newNode: Node<AiNodeData> | null = null;
      let newEdge: Edge<EditableEdgeData> | null = null;

      // If we are not reusing the active node, create a new AI node and an edge to connect it to the source node.
      if (!shouldReuseActive) {
        newNode = {
          id: targetNodeId,
          type: "ai-node",
          position: {
            x: sourceNode.position.x + sourceWidth + AI_NODE_HORIZONTAL_GAP,
            y: sourceNode.position.y,
          },
          data: {
            label: promptHtml,
            model,
            status: "in-progress",
            result: "",
            isTyping: false,
          },
          width: AI_NODE_DEFAULT_WIDTH,
          height: AI_NODE_DEFAULT_HEIGHT,
          style: {
            width: AI_NODE_DEFAULT_WIDTH,
            height: AI_NODE_DEFAULT_HEIGHT,
          },
          selected: true,
        };

        newEdge = {
          id: crypto.randomUUID(),
          source: sourceNode.id,
          target: targetNodeId,
          type: "editable",
          data: { ...createDefaultEditableEdgeData(), targetMarker: "arrow" },
          targetHandle: "left-target",
        };

        if (sourceNode.type === "ai-node") {
          newEdge.sourceHandle = "right-source";
        }
      }

      // Perform the action of adding the new node and edge to the canvas.
      performAction(() => {
        if (shouldReuseActive) {
          // If we are reusing the active node, update its data.
          setNodes((existing) =>
            existing.map((node) => {
              if (node.id === targetNodeId && node.type === "ai-node") {
                const nodeData = node.data as AiNodeData;

                return {
                  ...node,
                  data: {
                    ...nodeData,
                    label: promptHtml,
                    model,
                    status: "in-progress",
                    result: "",
                    isTyping: false,
                  },
                  selected: true,
                } as Node<AiNodeData>;
              }

              if (node.type === "ai-node") {
                const nodeData = node.data as AiNodeData;
                return {
                  ...node,
                  selected: false,
                  data: {
                    ...nodeData,
                    isTyping: false,
                  },
                } as Node<AiNodeData>;
              }

              if (node.selected) {
                return {
                  ...node,
                  selected: false,
                };
              }

              return node;
            }),
          );
        } else if (newNode) {
          // If we are not reusing the active node, add the new node and edge to the canvas.
          setNodes((existing) => {
            const clearedSelection = existing.map((node) => {
              if (node.id === activeNodeId) {
                if (node.type === "ai-node") {
                  return {
                    ...node,
                    selected: false,
                    data: {
                      ...(node.data as AiNodeData),
                      isTyping: false,
                    },
                  } as Node<AiNodeData>;
                }

                if (node.selected) {
                  return {
                    ...node,
                    selected: false,
                  };
                }

                return {
                  ...node,
                  selected: false,
                };
              }

              if (node.selected) {
                if (node.type === "ai-node") {
                  return {
                    ...node,
                    selected: false,
                    data: {
                      ...(node.data as AiNodeData),
                      isTyping: false,
                    },
                  } as Node<AiNodeData>;
                }

                return {
                  ...node,
                  selected: false,
                };
              }

              return node;
            });

            return [...clearedSelection, newNode];
          });

          if (newEdge) {
            const edgeToAdd = newEdge;
            setEdges((existing) => [...existing, edgeToAdd]);
          }
        }
      }, "Workspace AI prompt");

      // Set the new node as the active node.
      setState({ isOpen: true, activeNodeId: targetNodeId });

      const allowedAncestorNodeIds = new Set(
        pathNodes
          .filter((node) => node.type === "ai-node")
          .map((node) => node.id),
      );

      const { messages, hasUsableInput } = buildCanvasChatMessages({
        nodes: flowNodes,
        edges: flowEdges,
        targetNodeId,
        promptText: trimmedPrompt,
        supportsTextInput,
        supportsImageInput,
        contextNodes: pathNodes,
        allowedAncestorNodeIds,
      });

      if (!hasUsableInput) {
        setNodes((existing) =>
          existing.map((node) => {
            if (node.id !== targetNodeId || node.type !== "ai-node") {
              return node;
            }

            const nodeData = node.data as AiNodeData;

            return {
              ...node,
              data: {
                ...nodeData,
                status: "not-started",
                result: "",
                isTyping: false,
              },
            } as Node<AiNodeData>;
          }),
        );

        return;
      }

      // Keep track of the request ID to avoid race conditions.
      const currentRequestId = requestIdRef.current + 1;
      requestIdRef.current = currentRequestId;

      try {
        const imageManager = createAiImageGenerationManager({
          supportsImageOutput,
          isRequestCurrent: () => requestIdRef.current === currentRequestId,
          getAnchorNode: (nodes) =>
            nodes.find(
              (node): node is Node<AiNodeData> =>
                node.id === targetNodeId && node.type === "ai-node",
            ),
          minimumAnchorWidth: AI_NODE_DEFAULT_WIDTH,
          horizontalGap: AI_NODE_HORIZONTAL_GAP,
          setNodes,
          setEdges,
          edgeSourceId: targetNodeId,
          edgeSourceHandle: "right-source",
          buildEdgeMetadata: () => ({
            generatedByNodeId: targetNodeId,
            generatedFromPrompt: trimmedPrompt,
          }),
          onImageProcessingError: (error) => {
            console.error("Failed to process AI image chunk", error);
            toast.error("Failed to render AI image", {
              description: error instanceof Error ? error.message : String(error),
            });
          },
        });

        if (supportsImageOutput) {
          imageManager.reset();
        }

        // Generate the AI result.
        await generateAiResult({
          model,
          messages,
          minimumUpdateIntervalMs: 50,
          onProgress: ({ aggregatedText, newBlocks }) => {
            if (requestIdRef.current !== currentRequestId) {
              return;
            }

            if (supportsImageOutput) {
              for (const block of newBlocks) {
                if (block.type === "image-placeholder") {
                  imageManager.handlePlaceholderBlock(block);
                } else if (block.type === "image") {
                  imageManager.handleImageBlock(block);
                }
              }
            }

            setNodes((existing) =>
              existing.map((node) => {
                if (node.id !== targetNodeId || node.type !== "ai-node") {
                  return node;
                }

                const nodeData = node.data as AiNodeData;

                return {
                  ...node,
                  data: {
                    ...nodeData,
                    result: aggregatedText,
                  },
                };
              }),
            );
          },
          onUpdate: (fullResponse) => {
            // If the request ID has changed, it means a new request has been sent, so we should ignore this update.
            if (requestIdRef.current !== currentRequestId) {
              return;
            }

            // Update the result of the AI node as the response is being generated.
            setNodes((existing) =>
              existing.map((node) => {
                if (node.id !== targetNodeId || node.type !== "ai-node") {
                  return node;
                }

                const nodeData = node.data as AiNodeData;

                return {
                  ...node,
                  data: {
                    ...nodeData,
                    result: fullResponse,
                  },
                };
              }),
            );
          },
        });

        // When the AI result is fully generated, update the status of the node to "done".
        if (requestIdRef.current === currentRequestId) {
          setNodes((existing) =>
            existing.map((node) => {
              if (node.id !== targetNodeId || node.type !== "ai-node") {
                return node;
              }

              const nodeData = node.data as AiNodeData;

              return {
                ...node,
                data: {
                  ...nodeData,
                  status: "done",
                },
              };
            }),
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        toast.error("Failed to generate AI response", {
          description: errorMessage,
        });

        // If there was an error, update the status of the node to "done" and show an error message.
        if (requestIdRef.current === currentRequestId) {
          setNodes((existing) =>
            existing.map((node) => {
              if (node.id !== targetNodeId || node.type !== "ai-node") {
                return node;
              }

              const nodeData = node.data as AiNodeData;
              const existingResult = nodeData.result ?? "";
              const fallbackMessage =
                existingResult.trim().length > 0
                  ? existingResult
                  : "Unable to generate a response. Please verify your API configuration and try again.";

              return {
                ...node,
                data: {
                  ...nodeData,
                  status: "done",
                  result: fallbackMessage,
                },
              };
            }),
          );
        }

        throw error instanceof Error ? error : new Error(errorMessage);
      }
    },
    [
      getEdges,
      getNodes,
      performAction,
      setEdges,
      setNodes,
      state.activeNodeId,
      setState,
    ],
  );

  const { nodes: pathNodes, isCycleTruncated } = useMemo(() => {
    if (!state.activeNodeId) {
      return { nodes: [] as Node[], isCycleTruncated: false };
    }

    return deriveLinearHistoryPath(state.activeNodeId, nodes, edges);
  }, [edges, nodes, state.activeNodeId]);

  const items = useMemo(
    () => pathNodes.map((node) => summarizeNodeForHistory(node)),
    [pathNodes],
  );

  const value = useMemo<LinearHistoryContextValue>(
    () => ({
      isOpen: state.isOpen,
      activeNodeId: state.activeNodeId,
      items,
      isCycleTruncated,
      open,
      close,
      sendPrompt,
    }),
    [
      close,
      isCycleTruncated,
      items,
      open,
      sendPrompt,
      state.activeNodeId,
      state.isOpen,
    ],
  );

  return (
    <LinearHistoryContext.Provider value={value}>
      {children}
    </LinearHistoryContext.Provider>
  );
};

/**
 * A hook to access the linear history of the canvas.
 * It must be used within a `LinearHistoryProvider`.
 * @returns The linear history context.
 */
export const useLinearHistory = () => {
  const context = useContext(LinearHistoryContext);
  if (!context) {
    throw new Error(
      "useLinearHistory must be used within a LinearHistoryProvider",
    );
  }
  return context;
};
