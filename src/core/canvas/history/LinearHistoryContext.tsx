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
import type { ImageNodeData } from "../nodes/ImageNode";
import type { YouTubeNodeData } from "../nodes/YouTubeNode";
import { formatTextualNodeSummary, htmlToPlainText } from "../utils/text";
import type { AiModel } from "@/core/llm/aiModels";
import { generateAiResult, type ChatMessage } from "@/core/llm/generateAiResult";

export type LinearHistoryItem = {
  id: string;
  type?: string;
  title: string;
  summary?: string | null;
  prompt?: string | null;
  response?: string | null;
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

const deriveLinearHistoryPath = (
  activeNodeId: string,
  nodes: Node[],
  edges: Edge<EditableEdgeData>[],
) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const ordered: Node[] = [];
  let currentId: string | undefined = activeNodeId;
  let isCycleTruncated = false;

  while (currentId) {
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

    let parentId: string | undefined;
    for (const edge of edges) {
      if (edge.target === currentId) {
        parentId = edge.source;
        break;
      }
    }

    if (!parentId) {
      break;
    }

    currentId = parentId;
  }

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

const summarizeNodeForHistory = (node: Node): LinearHistoryItem => {
  const type = node.type;

  switch (type) {
    case "ai-node": {
      const data = (node.data as Partial<AiNodeData> | undefined) ?? {};
      const prompt = htmlToPlainText(data.label ?? "");
      const response = (data.result ?? "").trim();
      const modelLabel = data.model ? `AI (${data.model})` : "AI Node";

      return {
        id: node.id,
        type,
        title: modelLabel,
        summary: null,
        prompt: prompt || null,
        response: response || null,
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
      return {
        id: node.id,
        type,
        title: "Image",
        summary: descriptor || null,
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

  useEffect(() => {
    if (!state.isOpen || !state.activeNodeId) {
      return;
    }

    const exists = nodes.some((node) => node.id === state.activeNodeId);
    if (!exists) {
      setState({ isOpen: false, activeNodeId: null });
    }
  }, [nodes, state.activeNodeId, state.isOpen]);

  const sendPrompt = useCallback(
    async ({ model, prompt }: { model: AiModel; prompt: string }) => {
      const activeNodeId = state.activeNodeId;
      const trimmedPrompt = prompt.trim();

      if (!activeNodeId || trimmedPrompt.length === 0) {
        return;
      }

      const flowNodes = getNodes();
      const flowEdges = getEdges();
      const { nodes: pathNodes } = deriveLinearHistoryPath(
        activeNodeId,
        flowNodes,
        flowEdges,
      );

      if (pathNodes.length === 0) {
        return;
      }

      const sourceNode = pathNodes[pathNodes.length - 1]!;
      const sourceWidth = Number(
        sourceNode.width ?? sourceNode.style?.width ?? AI_NODE_DEFAULT_WIDTH,
      );
      const newNodeId = crypto.randomUUID();
      const promptHtml = convertPromptToHtml(trimmedPrompt);

      const newNode: Node<AiNodeData> = {
        id: newNodeId,
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

      const newEdge: Edge<EditableEdgeData> = {
        id: crypto.randomUUID(),
        source: sourceNode.id,
        target: newNodeId,
        type: "editable",
        data: { ...createDefaultEditableEdgeData(), targetMarker: "arrow" },
        targetHandle: "left-target",
      };

      if (sourceNode.type === "ai-node") {
        newEdge.sourceHandle = "right-source";
      }

      performAction(() => {
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

        setEdges((existing) => [...existing, newEdge]);
      }, "Workspace AI prompt");

      setState({ isOpen: true, activeNodeId: newNodeId });

      const textualContextEntries = pathNodes
        .map((node) => formatTextualNodeSummary(node))
        .filter((entry): entry is string => Boolean(entry));

      const messages: ChatMessage[] = [];

      if (textualContextEntries.length > 0) {
        messages.push({
          role: "user",
          content: `Canvas context:\n${textualContextEntries
            .map((entry) => `- ${entry}`)
            .join("\n")}`,
        });
      }

      for (const node of pathNodes) {
        if (node.type !== "ai-node") {
          continue;
        }

        const nodeData = node.data as AiNodeData | undefined;
        const promptText = htmlToPlainText(nodeData?.label ?? "");
        const responseText = (nodeData?.result ?? "").trim();

        if (promptText) {
          messages.push({ role: "user", content: promptText });
        }

        if (responseText) {
          messages.push({ role: "assistant", content: responseText });
        }
      }

      messages.push({ role: "user", content: trimmedPrompt });

      const currentRequestId = requestIdRef.current + 1;
      requestIdRef.current = currentRequestId;

      try {
        await generateAiResult({
          model,
          messages,
          minimumUpdateIntervalMs: 50,
          onUpdate: (fullResponse) => {
            if (requestIdRef.current !== currentRequestId) {
              return;
            }

            setNodes((existing) =>
              existing.map((node) => {
                if (node.id !== newNodeId || node.type !== "ai-node") {
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

        if (requestIdRef.current === currentRequestId) {
          setNodes((existing) =>
            existing.map((node) => {
              if (node.id !== newNodeId || node.type !== "ai-node") {
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

        if (requestIdRef.current === currentRequestId) {
          setNodes((existing) =>
            existing.map((node) => {
              if (node.id !== newNodeId || node.type !== "ai-node") {
                return node;
              }

              const nodeData = node.data as AiNodeData;
              const existingResult = nodeData.result ?? "";

              return {
                ...node,
                data: {
                  ...nodeData,
                  status: "done",
                  result:
                    existingResult.trim().length > 0
                      ? existingResult
                      : "Unable to generate a response. Please verify your API configuration and try again.",
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

export const useLinearHistory = () => {
  const context = useContext(LinearHistoryContext);
  if (!context) {
    throw new Error(
      "useLinearHistory must be used within a LinearHistoryProvider",
    );
  }
  return context;
};
