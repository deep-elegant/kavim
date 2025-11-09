import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { type NodeProps, type Node, type XYPosition } from "@xyflow/react";
import {
  GitBranch,
  Copy,
  RefreshCcw,
  Play,
  Square,
  Paperclip,
  Image as ImageIcon,
  ChevronDown,
} from "lucide-react";
import { marked } from "marked";
import { toast } from "sonner";

import NodeInteractionOverlay from "./NodeInteractionOverlay";
import { type DrawableNode } from "./DrawableNode";
import {
  type ImageNodeType,
  IMAGE_NODE_MIN_HEIGHT,
  IMAGE_NODE_MIN_WIDTH,
} from "./ImageNode";
import { cn } from "@/utils/tailwind";
import { AI_MODELS, type AiModel } from "../../llm/aiModels";
import { generateAiResult } from "@/core/llm/generateAiResult";
import { SingleLlmSelect } from "@/core/llm/SingleLlmSelect";
import {
  buildCanvasChatMessages,
  type BuildCanvasChatMessagesResult,
} from "@/core/llm/buildCanvasChatMessages";
import { createDefaultEditableEdgeData } from "../edges/EditableEdge";
import { useCanvasData } from "../CanvasDataContext";
import { htmlToPlainText } from "../utils/text";
import { createAiImageGenerationManager } from "../utils/aiImageGeneration";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCanvasActions } from "../types";

export type AiStatus = "not-started" | "in-progress" | "done" | "error";

/** Data structure for AI-powered nodes that generate responses based on prompts */
export type AiNodeData = {
  label: string; // User's prompt
  attachments?: string[]; // list of connected image node IDs
  model?: AiModel;
  status?: AiStatus;
  result?: string; // AI-generated response
};

export type AiNodeType = Node<AiNodeData, "ai-node">;

// Defines the minimum dimensions for an AI node.
const MIN_WIDTH = 420;
const MIN_HEIGHT = 480;
// Defines the horizontal gap between a node and a newly created split node.
const NODE_HORIZONTAL_GAP = 80;

/**
 * Implements DrawableNode interface for creating AI nodes via drag interaction.
 * Larger minimum size than text nodes to accommodate prompt + response display.
 */
export const aiNodeDrawable: DrawableNode<AiNodeType> = {
  onPaneMouseDown: (id, position) => ({
    id,
    type: "ai-node",
    position,
    data: {
      label: "",
      model: "deepseek",
      status: "not-started",
      result: "",
      attachments: [],
    },
    width: MIN_WIDTH,
    height: MIN_HEIGHT,
    style: { width: MIN_WIDTH, height: MIN_HEIGHT },
    selected: true,
  }),

  onPaneMouseMove: (node, start, current) => {
    const width = Math.max(Math.abs(current.x - start.x), MIN_WIDTH);
    const height = Math.max(Math.abs(current.y - start.y), MIN_HEIGHT);
    const position = {
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
    };

    return {
      ...node,
      position,
      width,
      height,
      style: {
        ...node.style,
        width,
        height,
      },
    };
  },

  onPaneMouseUp: (node) => {
    const width = Math.max(
      Number(node.style?.width ?? node.width ?? 0),
      MIN_WIDTH,
    );
    const height = Math.max(
      Number(node.style?.height ?? node.height ?? 0),
      MIN_HEIGHT,
    );

    return {
      ...node,
      width,
      height,
      style: {
        ...node.style,
        width,
        height,
      },
      data: {
        ...node.data,
      },
    };
  },
};

/** Human-readable labels for AI processing states */
const STATUS_LABELS: Record<AiStatus, string> = {
  "not-started": "Draft",
  "in-progress": "Thinking…",
  done: "Ready",
  error: "Error",
};

/** Color-coded badge styles for visual status indication */
const STATUS_STYLES: Record<AiStatus, string> = {
  "not-started": "bg-slate-500",
  "in-progress": "bg-sky-400",
  done: "bg-emerald-400",
  error: "bg-red-500",
};

/**
 * Renders an AI-powered node that generates responses from prompts.
 * - Top section: User's prompt (editable rich text)
 * - Bottom section: AI's response (markdown-rendered, read-only)
 * - Builds chat history from connected upstream AI nodes for context
 * - Auto-runs prompt when user stops typing
 * - Supports creating "split" nodes for exploring multiple conversation branches
 */
const AiNode = memo(({ id, data, selected }: NodeProps<AiNodeType>) => {
  const { setNodes, setEdges, getNodes, getEdges, doc } = useCanvasData();
  const { addImageFromDialog } = useCanvasActions();

  const updateNodeData = useCallback(
    (newData: Partial<AiNodeData>) => {
      setNodes((nodes) =>
        nodes.map((n) => {
          if (n.id === id) {
            return {
              ...n,
              data: {
                ...n.data,
                ...newData,
              },
            };
          }
          return n;
        }),
      );
    },
    [id, setNodes],
  );

  const [prompt, setPrompt] = useState(data.label ?? "");

  const attachmentNodes = useMemo(() => {
    const allNodes = getNodes();
    return (data.attachments ?? [])
      .map((nodeId) => allNodes.find((n) => n.id === nodeId))
      .filter((n): n is ImageNodeType => !!n && n.type === "image-node");
  }, [data.attachments, getNodes]);

  const model = data.model ?? "deepseek";
  const resolvedModel = useMemo(
    () => AI_MODELS.find((option) => option.value === model),
    [model],
  );
  const modelLabel = resolvedModel?.label ?? model;
  const modelInputCapabilities = resolvedModel?.capabilities?.input ?? ["text"];
  const modelOutputCapabilities =
    resolvedModel?.capabilities?.output ?? ["text"];
  const supportsTextInput = modelInputCapabilities.includes("text");
  const supportsImageInput = modelInputCapabilities.includes("image");
  const supportsImageOutput = modelOutputCapabilities.includes("image");
  const status = data.status ?? "not-started";
  const resultMarkdown = data.result ?? "";
  const resultHtml = useMemo(
    () => marked.parse(resultMarkdown || ""),
    [resultMarkdown],
  );
  const resultPlainText = useMemo(
    () => htmlToPlainText(resultHtml),
    [resultHtml],
  );
  const hasTextResponse = resultPlainText.trim().length > 0;

  // Increment on each new request to cancel stale responses (prevents race conditions)
  const requestIdRef = useRef(0);

  /**
   * Builds conversation history by traversing connected AI nodes upstream.
   * - Follows edges backwards to find parent AI nodes
   * - Recursively collects prompts and responses in chronological order
   * - Prevents cycles with visited set
   * - Enables contextual conversations where each node builds on previous ones
   */
  const buildChatHistory = useCallback(
    (promptHtml: string): BuildCanvasChatMessagesResult => {
      const flowNodes = getNodes();
      const flowEdges = getEdges();
      const promptText = htmlToPlainText(promptHtml);

      return buildCanvasChatMessages({
        nodes: flowNodes,
        edges: flowEdges,
        targetNodeId: id,
        promptText,
        supportsTextInput,
        supportsImageInput,
      });
    },
    [getEdges, getNodes, id, supportsImageInput, supportsTextInput],
  );

  /**
   * Creates a new AI node to the right, connected to this one.
   * - Enables exploring different conversation branches from the same context
   * - New node inherits the model selection but starts with empty prompt
   * - Positioned to the right with consistent spacing
   * - Auto-activates typing mode for immediate input
   */
  const handleCreateSplit = useCallback(() => {
    const flowNodes = getNodes();
    const currentNode = flowNodes.find((node) => node.id === id);

    if (!currentNode) {
      return;
    }

    const width = Number(
      currentNode.width ?? currentNode.style?.width ?? MIN_WIDTH,
    );
    const newNodeId = crypto.randomUUID();
    const newPosition = {
      x: currentNode.position.x + width + NODE_HORIZONTAL_GAP,
      y: currentNode.position.y,
    };

    const currentNodeData = currentNode.data as AiNodeData | undefined;
    const newNodeData: AiNodeData = {
      label: "",
      model: currentNodeData?.model ?? model, // Inherit model choice
      status: "not-started",
      result: "",
    };

    setNodes((existing) => {
      // Deselect all nodes and exit typing mode on current node
      const clearedSelection = existing.map((node) => {
        if (node.selected) {
          return {
            ...node,
            selected: false,
          };
        }

        return node;
      });

      return [
        ...clearedSelection,
        {
          id: newNodeId,
          type: "ai-node",
          position: newPosition,
          data: newNodeData,
          width: MIN_WIDTH,
          height: MIN_HEIGHT,
          style: { width: MIN_WIDTH, height: MIN_HEIGHT },
          selected: true,
        } as AiNodeType,
      ];
    });

    // Create edge connecting this node to the new split node
    setEdges((prevEdges) => [
      ...prevEdges,
      {
        id: crypto.randomUUID(),
        source: id,
        sourceHandle: "right-source",
        target: newNodeId,
        targetHandle: "left-target",
        type: "editable",
        data: { ...createDefaultEditableEdgeData(), targetMarker: "arrow" },
      },
    ]);
  }, [getNodes, id, model, setEdges, setNodes]);

  /**
   * Executes the AI prompt with full chat history context.
   * - Streams response chunks for real-time feedback
   * - Uses request ID to cancel stale responses if prompt changes mid-generation
   * - Updates node status throughout the lifecycle (in-progress -> done)
   */
  const runPrompt = useCallback(async () => {
    const promptText = prompt;
    const { messages, hasUsableInput: hasHistoryInput } =
      buildChatHistory(prompt);

    const hasTextInput = promptText.trim().length > 0;
    const hasUsableInput = hasHistoryInput || hasTextInput;

    if (!hasUsableInput) {
      updateNodeData({
        status: "not-started",
        result: "",
      });
      return;
    }

    // Increment request ID to invalidate any in-flight requests
    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;
    updateNodeData({
      status: "in-progress",
      result: "",
      label: prompt,
    });

    try {
      const imageManager = createAiImageGenerationManager({
        supportsImageOutput,
        isRequestCurrent: () => requestIdRef.current === currentRequestId,
        getAnchorNode: (nodes) =>
          nodes.find(
            (node): node is AiNodeType =>
              node.id === id && node.type === "ai-node",
          ),
        minimumAnchorWidth: MIN_WIDTH,
        horizontalGap: NODE_HORIZONTAL_GAP,
        setNodes,
        setEdges,
        edgeSourceId: id,
        edgeSourceHandle: "right-source",
        buildEdgeMetadata: () => ({
          generatedByNodeId: id,
          generatedFromPrompt: promptText,
        }),
        onImageProcessingError: (error) => {
          console.error("Failed to process AI image chunk", error);
          toast.error("Failed to render AI image", {
            description:
              error instanceof Error ? error.message : String(error),
          });
        },
      });

      if (supportsImageOutput) {
        imageManager.reset();
      }

      await generateAiResult({
        model,
        messages,
        minimumUpdateIntervalMs: 50,
        onStart: () => {
          imageManager.handlePlaceholderBlock();
        },
        onProgress: ({ aggregatedText, newBlocks }) => {
          if (requestIdRef.current !== currentRequestId) {
            return;
          }

          if (supportsImageOutput) {
            for (const block of newBlocks) {
              if (block.type === "image") {
                imageManager.handleImageBlock(block);
              }
            }
          }

          setNodes((nodes) =>
            nodes.map((n) => {
              if (n.id !== id) {
                return n;
              }

              const nodeData = n.data as AiNodeData;

              return {
                ...n,
                data: {
                  ...nodeData,
                  result: aggregatedText,
                },
              } satisfies AiNodeType;
            }),
          );
        },
        onUpdate: (fullResponse) => {
          // Only update if this is still the current request (user hasn't changed prompt)
          if (requestIdRef.current === currentRequestId) {
            setNodes((nodes) =>
              nodes.map((n) => {
                if (n.id !== id) {
                  return n;
                }

                const nodeData = n.data as AiNodeData;

                return {
                  ...n,
                  data: {
                    ...nodeData,
                    result: fullResponse,
                  },
                } satisfies AiNodeType;
              }),
            );
          }
        },
      });

      if (requestIdRef.current === currentRequestId) {
        updateNodeData({ status: "done" });
      }
    } catch (error) {
      console.error("Failed to generate AI result", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(`Failed to generate response with ${modelLabel}`, {
        description: errorMessage,
      });

      if (requestIdRef.current === currentRequestId) {
        updateNodeData({
          status: "error",
          result:
            "Unable to generate a response. Please verify your API configuration and try again.",
        });
      }
    }
  }, [
    prompt,
    attachmentNodes,
    buildChatHistory,
    updateNodeData,
    supportsImageOutput,
    model,
    id,
    setNodes,
    setEdges,
    doc,
    modelLabel,
  ]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void runPrompt();
    }
  };

  const handleCopyTextResponse = useCallback(async () => {
    const contentToCopy = resultMarkdown || resultPlainText;

    if (!contentToCopy) {
      toast.info("No AI response to copy yet.");
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("Clipboard is not available.");
      return;
    }

    try {
      await navigator.clipboard.writeText(contentToCopy);
      toast.success("AI response copied to clipboard.");
    } catch (error) {
      console.error("Failed to copy AI response", error);
      toast.error("Failed to copy AI response.");
    }
  }, [resultMarkdown, resultPlainText]);

  /**
   * Handles changes to the AI model selection.
   * Updates the node's data.
   * @param value The new AI model value.
   */
  const onChangeModel = useCallback(
    (value: string) => {
      updateNodeData({ model: value as AiModel });
    },
    [updateNodeData],
  );

  const handleAttachClick = async () => {
    const currentNode = getNodes().find((n) => n.id === id);
    if (!currentNode) return;

    const gap = 60;
    const imageNodeWidth = 200; // A reasonable default guess
    const position: XYPosition = {
      x: currentNode.position.x - imageNodeWidth - gap,
      y: currentNode.position.y,
    };

    const newNode = await addImageFromDialog(position);
    if (!newNode) return;

    // After the node is created, we might want to adjust its position based on its actual width
    const finalPosition: XYPosition = {
      x: currentNode.position.x - (newNode.width ?? imageNodeWidth) - gap,
      y: currentNode.position.y,
    };

    setNodes((nds) =>
      nds.map((n) =>
        n.id === newNode.id ? { ...n, position: finalPosition } : n,
      ),
    );

    const newEdge = {
      id: crypto.randomUUID(),
      source: newNode.id,
      target: id,
      type: "editable",
      data: createDefaultEditableEdgeData(),
    };
    setEdges((eds) => [...eds, newEdge]);

    updateNodeData({
      attachments: [...(data.attachments ?? []), newNode.id],
    });
  };

  const clearAttachments = () => {
    const attachmentIds = data.attachments ?? [];
    if (attachmentIds.length === 0) return;

    setNodes((nds) => nds.filter((n) => !attachmentIds.includes(n.id)));
    setEdges((eds) =>
      eds.filter(
        (e) => !(e.target === id && attachmentIds.includes(e.source)),
      ),
    );

    updateNodeData({ attachments: [] });
  };

  const isRunning = status === "in-progress";
  const hasPrompt = !!prompt.trim();
  const hasAttachments = attachmentNodes.length > 0;
  const isSendDisabled = (!hasPrompt && !hasAttachments) || isRunning;

  return (
    <NodeInteractionOverlay
      nodeId={id}
      isActive={selected}
      isEditing={false}
      minWidth={MIN_WIDTH}
      minHeight={MIN_HEIGHT}
    >
      <div className="h-full w-full bg-gradient-to-br from-sky-500/40 via-cyan-400/30 to-fuchsia-500/40 p-[1px] rounded-3xl shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
        <Card className="bg-white text-slate-900 border border-slate-200 rounded-3xl h-full flex flex-col">
          {/* HEADER */}
          <CardHeader className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Left side: Model selector + Status inline */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 border border-slate-300 px-3 py-1 text-[11px] font-medium tracking-wide">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      STATUS_STYLES[status],
                    )}
                  />
                  <div className="relative flex items-center">
                    <SingleLlmSelect
                      value={model}
                      onChange={onChangeModel}
                      triggerClassName="appearance-none bg-transparent pr-5 text-[11px] font-medium focus:outline-none cursor-pointer h-auto border-0"
                      contentClassName="bg-white text-slate-900 border-slate-300"
                    />
                    <ChevronDown className="pointer-events-none absolute right-0 h-3 w-3 text-slate-400" />
                  </div>
                </div>

                {/* Draft status on same line */}
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11px] text-slate-700">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      STATUS_STYLES[status],
                    )}
                  />
                  <span className="uppercase tracking-[0.16em]">
                    {STATUS_LABELS[status]}
                  </span>
                </div>
              </div>

              {/* Right side */}
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-600 text-lg leading-none hover:border-slate-400 hover:text-slate-900 transition"
                aria-label="Node menu"
              >
                ⋯
              </button>
            </div>
          </CardHeader>

          {/* BODY */}
          <CardContent className="px-5 py-4 space-y-4 flex-1">
            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <span className="font-medium tracking-wide text-slate-700">
                Prompt
              </span>
              <span>{prompt.length || 0} chars</span>
            </div>

            <Textarea
              placeholder="Ask or paste a prompt…"
              className="bg-slate-100 border border-slate-300 rounded-2xl min-h-[88px] resize-none text-sm leading-relaxed focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:border-sky-400/50 placeholder:text-slate-400"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isRunning}
            />

            {/* Attachments (multimodal) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-600">
                <span className="text-[11px] text-slate-500">
                  Attachments
                </span>
                <span>
                  {attachmentNodes.length
                    ? `${attachmentNodes.length} file${
                        attachmentNodes.length > 1 ? "s" : ""
                      }`
                    : "Optional"}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-slate-300 bg-slate-100 text-[11px] text-slate-700 hover:bg-slate-200 hover:border-slate-400"
                    onClick={handleAttachClick}
                  >
                    <Paperclip className="mr-1 h-3.5 w-3.5" />
                    Add image or file
                  </Button>
                  {attachmentNodes.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAttachments}
                      className="text-[11px] text-slate-600 hover:text-slate-900"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-slate-500">
                  Images are sent to the model for multimodal answers.
                </span>
              </div>

              {attachmentNodes.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {attachmentNodes.map((att) => (
                    <div
                      key={att.id}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-300 px-2.5 py-1 text-[11px] text-slate-700 max-w-[140px]"
                    >
                      <ImageIcon className="h-3.5 w-3.5 text-sky-400" />
                      <span className="truncate">{att.data.fileName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Response preview */}
            {hasTextResponse ? (
              <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-[13px] leading-relaxed text-slate-800 space-y-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Response
                  </span>
                  <span>{modelLabel}</span>
                </div>

                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: resultHtml }}
                />

                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-600">
                  <button
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 hover:border-slate-400 hover:text-slate-900 transition"
                    type="button"
                    onClick={runPrompt}
                  >
                    <RefreshCcw size={12} />
                    Retry
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 hover:border-slate-400 hover:text-slate-900 transition"
                    onClick={handleCreateSplit}
                  >
                    <GitBranch size={12} />
                    Branch
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 hover:border-slate-400 hover:text-slate-900 transition"
                    type="button"
                    onClick={handleCopyTextResponse}
                  >
                    <Copy size={12} />
                    Copy
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-100 px-3.5 py-3 text-[12px] text-slate-600 flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-700">
                    No response yet
                  </div>
                  <div>
                    Write a prompt or attach an image, then press ⌘/Ctrl+Enter
                    to run.
                  </div>
                </div>
                <div className="hidden sm:flex items-center justify-center h-8 w-8 rounded-full border border-slate-300 text-[10px] text-slate-700">
                  AI
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-2 border-t border-slate-200 px-5 py-3 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>Shift+Enter = newline • ⌘/Ctrl+Enter = Send</span>

            {isRunning ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-red-500/70 text-red-400 bg-red-500/5 hover:bg-red-500/15 hover:text-red-200"
                onClick={() =>
                  updateNodeData({
                    status: "done",
                  })
                }
              >
                <Square className="mr-1 h-4 w-4" /> Stop
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8 rounded-full bg-sky-500 hover:bg-sky-400 disabled:bg-slate-200 disabled:text-slate-500"
                onClick={() => runPrompt()}
                disabled={isSendDisabled}
              >
                <Play className="mr-1 h-4 w-4" />
                {status === "done" || status === "error" ? "Resend" : "Send"}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </NodeInteractionOverlay>
  );
});

AiNode.displayName = "AiNode";

export default AiNode;
