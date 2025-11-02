import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
} from "react";
import { type NodeProps, type Node } from "@xyflow/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Split } from "lucide-react";
import { marked } from "marked";
import { toast } from "sonner";
import { ContextMenuItem } from "@/components/ui/context-menu";

import NodeInteractionOverlay from "./NodeInteractionOverlay";
import { type DrawableNode } from "./DrawableNode";
import { type ImageNodeData, type ImageNodeType } from "./ImageNode";
import { MinimalTiptap } from "@/components/ui/minimal-tiptap";
import { cn } from "@/utils/tailwind";
import { useNodeAsEditor } from "@/helpers/useNodeAsEditor";
import { type FontSizeSetting } from "@/components/ui/minimal-tiptap/FontSizePlugin";
import { useAutoFontSizeObserver } from "./useAutoFontSizeObserver";
import { AI_MODELS, type AiModel } from "../../llm/aiModels";
import { generateAiResult } from "@/core/llm/generateAiResult";
import { SingleLlmSelect } from "@/core/llm/SingleLlmSelect";
import {
  buildCanvasChatMessages,
  type BuildCanvasChatMessagesResult,
} from "@/core/llm/buildCanvasChatMessages";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { createDefaultEditableEdgeData } from "../edges/EditableEdge";
import { useCanvasData } from "../CanvasDataContext";
import { formatTextualNodeSummary, htmlToPlainText } from "../utils/text";
import { createAiImageGenerationManager } from "../utils/aiImageGeneration";

export type AiStatus = "not-started" | "in-progress" | "done";

/** Data structure for AI-powered nodes that generate responses based on prompts */
export type AiNodeData = {
  label: string; // User's prompt
  isTyping?: boolean;
  model?: AiModel;
  status?: AiStatus;
  result?: string; // AI-generated response
  fontSize?: FontSizeSetting;
};

export type AiNodeType = Node<AiNodeData, "ai-node">;

// Defines the minimum dimensions for an AI node.
const MIN_WIDTH = 360;
const MIN_HEIGHT = 270;
// Defines the horizontal gap between a node and a newly created split node.
const NODE_HORIZONTAL_GAP = 80;

const PROMPT_PLACEHOLDER_HTML = "<p>No prompt yet.</p>";
const PROMPT_TYPOGRAPHY = cn(
  "prose prose-sm w-full max-w-none",
  "prose-h1:text-xl prose-h1:leading-tight",
  "prose-h2:text-lg prose-h2:leading-snug",
  "prose-h3:text-base prose-h3:leading-snug",
  "prose-p:my-1 prose-p:leading-normal",
  "prose-ul:my-1 prose-ol:my-1",
  "prose-li:my-0",
  "min-h-[1.5rem] px-3 py-2",
  "text-slate-900",
  "break-words",
);

const AI_MODEL_VALUES = AI_MODELS.map((option) => option.value) as [
  AiModel,
  ...AiModel[],
];

const aiNodeFormSchema = z.object({
  model: z.enum(AI_MODEL_VALUES),
  prompt: z.string(),
});

type AiNodeFormValues = z.infer<typeof aiNodeFormSchema>;

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
        isTyping: false,
        model: "deepseek",
        status: "not-started",
        result: "",
        fontSize: "auto",
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
        isTyping: true, // Auto-activate typing mode for immediate prompt input
      },
    };
  },
};

/** Human-readable labels for AI processing states */
const STATUS_LABELS: Record<AiStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  done: "Done",
};

/** Color-coded badge styles for visual status indication */
const STATUS_STYLES: Record<AiStatus, string> = {
  "not-started": "bg-slate-100 text-slate-700",
  "in-progress": "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
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
  const contentRef = useRef<HTMLDivElement>(null);
  const promptContainerRef = useRef<HTMLDivElement>(null);
  const promptMeasurementRef = useRef<HTMLDivElement>(null);
  const {
    editor,
    isTyping,
    handleDoubleClick,
    handleBlur,
    updateNodeData,
    setTypingState,
    fontSizeSetting,
    resolvedFontSize,
  } = useNodeAsEditor({
    id,
    data,
  });
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
  const responseResizeSignature = useMemo(() => resultMarkdown, [resultMarkdown]);
  const label = data.label ?? "";

  const promptHasContent = useMemo(
    () => htmlToPlainText(label).length > 0,
    [label],
  );
  const promptDisplayHtml = promptHasContent ? label : PROMPT_PLACEHOLDER_HTML;
  const promptMeasurementHtml = promptHasContent ? label : "<p></p>";

  const form = useForm<AiNodeFormValues>({
    resolver: zodResolver(aiNodeFormSchema),
    values: {
      model,
      prompt: label,
    },
  });

  useAutoFontSizeObserver({
    editor,
    fontSize: fontSizeSetting,
    html: promptMeasurementHtml,
    containerRef: promptContainerRef,
    measurementRef: promptMeasurementRef,
    maxSize: 36,
  });

  const [isPromptOpen, setPromptOpen] = useState(false);

  // Increment on each new request to cancel stale responses (prevents race conditions)
  const requestIdRef = useRef(0);
  const lastPromptRef = useRef(label);
  const wasTypingRef = useRef(isTyping);

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
    [
      getEdges,
      getNodes,
      id,
      supportsImageInput,
      supportsTextInput,
    ],
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
      isTyping: true,
      model: currentNodeData?.model ?? model, // Inherit model choice
      status: "not-started",
      result: "",
    };

    setNodes((existing) => {
      // Deselect all nodes and exit typing mode on current node
      const clearedSelection = existing.map((node) => {
        if (node.id === id && node.type === "ai-node") {
          return {
            ...node,
            selected: false,
            data: {
              ...(node.data as AiNodeData),
              isTyping: false,
            },
          } as AiNodeType;
        }

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

  // Memoized prompt display (shown in top section of node when not editing)
  const renderPromptContent = useMemo(
    () => (
      <div ref={promptContainerRef} className="relative w-full">
        <div
          className={PROMPT_TYPOGRAPHY}
          style={{ fontSize: `${resolvedFontSize}px` }}
          dangerouslySetInnerHTML={{ __html: promptDisplayHtml }}
        />
        <div
          ref={promptMeasurementRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 box-border overflow-hidden opacity-0",
            PROMPT_TYPOGRAPHY,
          )}
          dangerouslySetInnerHTML={{ __html: promptMeasurementHtml }}
        />
      </div>
    ),
    [promptDisplayHtml, promptMeasurementHtml, resolvedFontSize],
  );

  /**
   * Executes the AI prompt with full chat history context.
   * - Streams response chunks for real-time feedback
   * - Uses request ID to cancel stale responses if prompt changes mid-generation
   * - Updates node status throughout the lifecycle (in-progress -> done)
   */
  const runPrompt = useCallback(
    async (prompt: string) => {
      const promptText = htmlToPlainText(prompt);
      const { messages, hasUsableInput } = buildChatHistory(prompt);

      if (!hasUsableInput) {
        lastPromptRef.current = prompt;
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
      });

      try {
        const owner = doc ? String(doc.clientID) : undefined;
        const imageManager = createAiImageGenerationManager({
          supportsImageOutput,
          isRequestCurrent: () => requestIdRef.current === currentRequestId,
          getAnchorNode: (nodes) =>
            nodes.find(
              (node): node is AiNodeType => node.id === id && node.type === "ai-node",
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
          owner,
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
          lastPromptRef.current = prompt;
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
            status: "done",
            result:
              "Unable to generate a response. Please verify your API configuration and try again.",
          });
          lastPromptRef.current = prompt;
        }
      }
    },
    [
      buildChatHistory,
      id,
      supportsImageOutput,
      model,
      modelLabel,
      setEdges,
      setNodes,
      updateNodeData,
      doc,
    ],
  );

  // Auto-run prompt when user finishes typing (detects typing -> not typing transition)
  useEffect(() => {
    if (wasTypingRef.current && !isTyping) {
      if (label !== lastPromptRef.current && label !== "") {
        void runPrompt(label);
      }
    }

    wasTypingRef.current = isTyping;
  }, [isTyping, label, runPrompt]);

  // Auto-expand node height when response content grows beyond current height
  useEffect(() => {
    if (!contentRef.current) {
      return;
    }

    const { scrollHeight } = contentRef.current;

    setNodes((nodes) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return nodes;

      const currentHeight = node.height ?? 0;

      if (scrollHeight > currentHeight) {
        return nodes.map((n) => {
          if (n.id === id) {
            return {
              ...n,
              height: scrollHeight,
              style: { ...n.style, height: scrollHeight },
            };
          }
          return n;
        });
      }
      return nodes;
    });
  }, [id, responseResizeSignature, setNodes]);

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
   * Custom blur handler to prevent exiting edit mode when interacting with:
   * - Radix UI popovers (e.g., formatting toolbar)
   * - Elements within the content area (e.g., clicking response section)
   */
  const customOnBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const potentialNextFocus =
        event.relatedTarget instanceof Element
          ? event.relatedTarget
          : typeof document !== "undefined"
            ? document.activeElement
            : null;

      // Don't blur if focus moved to toolbar popover or within content area
      if (
        (potentialNextFocus instanceof Element &&
          potentialNextFocus.closest("[data-radix-popper-content-wrapper]")) ||
        (contentRef.current &&
          potentialNextFocus instanceof Node &&
          contentRef.current.contains(potentialNextFocus))
      ) {
        return;
      }
      handleBlur(event);
    },
    [handleBlur],
  );

  /**
   * Handles changes to the AI model selection.
   * Updates the node's data and re-focuses the editor.
   * @param value The new AI model value.
   */
  const onChangeModel = useCallback(
    (value: string) => {
      updateNodeData({ model: value as AiModel });
      setTypingState(true);
      const currentEditor = editor;
      if (currentEditor) {
        setTimeout(() => {
          currentEditor.commands.focus("end");
        }, 0);
      }
    },
    [form, editor, setTypingState],
  );

  return (
    <NodeInteractionOverlay
      nodeId={id}
      isActive={selected}
      isEditing={isTyping}
      minWidth={MIN_WIDTH}
      minHeight={MIN_HEIGHT}
      className="text-slate-900"
      editor={editor}
      contextMenuItems={
        !hasTextResponse
          ? undefined
          : (
              <ContextMenuItem onSelect={() => void handleCopyTextResponse()}>
                Copy AI Response
              </ContextMenuItem>
            )
      }
    >
      <button
        type="button"
        aria-label="Branch prompt"
        className="absolute top-1/2 -right-3 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow transition hover:bg-slate-100"
        onClick={(event) => {
          event.stopPropagation();
          handleCreateSplit();
        }}
      >
        <Split className="h-3.5 w-3.5" />
      </button>
      <div
        ref={contentRef}
        className="border-border flex h-full w-full flex-col gap-3 rounded-lg border bg-white p-3 shadow"
        onDoubleClick={handleDoubleClick}
        onBlur={customOnBlur}
        role="presentation"
      >
        {isTyping ? (
          <Form {...form}>
            <div
              className="flex h-full w-full flex-col gap-3"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-medium text-slate-600">
                      Model
                    </FormLabel>
                    <FormControl>
                      <SingleLlmSelect
                        value={field.value}
                        onChange={onChangeModel}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="prompt"
                render={() => (
                  <FormItem className="flex h-full flex-col space-y-0">
                    <FormLabel className="text-xs font-medium text-slate-600">
                      Prompt
                    </FormLabel>
                    <FormControl className="mt-1 min-h-[120px] flex-1">
                      <div
                        ref={promptContainerRef}
                        className="relative h-full overflow-hidden rounded-md border border-slate-300"
                      >
                        <MinimalTiptap
                          editor={editor}
                          theme="transparent"
                          className="h-full w-full"
                          style={{ fontSize: `${resolvedFontSize}px` }}
                        />
                        <div
                          ref={promptMeasurementRef}
                          aria-hidden
                          className={cn(
                            "pointer-events-none absolute inset-0 box-border overflow-hidden opacity-0",
                            PROMPT_TYPOGRAPHY,
                          )}
                          dangerouslySetInnerHTML={{
                            __html: promptMeasurementHtml,
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Form>
        ) : (
          <div
            className="flex h-full w-full flex-col gap-3"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Status</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  STATUS_STYLES[status],
                )}
              >
                {STATUS_LABELS[status]}
              </span>
            </div>
            <div className="rounded-md border border-slate-200">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700"
                onClick={(event) => {
                  event.stopPropagation();
                  setPromptOpen((current) => !current);
                }}
              >
                <span>Prompt</span>
                <span className="text-xs text-slate-500">
                  {isPromptOpen ? "Hide" : "Show"}
                </span>
              </button>
              {isPromptOpen && (
                <div className="border-t border-slate-200">
                  {renderPromptContent}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Result</span>
              <div
                className={cn(
                  "min-h-[120px] w-full rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm",
                  hasTextResponse ? "text-slate-900" : "text-slate-500",
                )}
              >
                {hasTextResponse ? (
                  <div
                    className="prose prose-sm max-w-none text-slate-900"
                    dangerouslySetInnerHTML={{ __html: resultHtml }}
                  />
                ) : (
                  <p className="text-sm text-slate-500">No AI response yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </NodeInteractionOverlay>
  );
});

AiNode.displayName = "AiNode";

export default AiNode;
