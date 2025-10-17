import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, type Node, type Edge } from '@xyflow/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Split } from 'lucide-react';
import { marked } from 'marked';

import NodeInteractionOverlay from './NodeInteractionOverlay';
import { type DrawableNode } from './DrawableNode';
import { MinimalTiptap } from '@/components/ui/minimal-tiptap';
import { cn } from '@/utils/tailwind';
import { useNodeAsEditor } from '@/helpers/useNodeAsEditor';
import { DEFAULT_FONT_SIZE, type FontSizeMode } from '@/helpers/FontSize';
import { AI_MODELS, type AiModel } from '../../llm/aiModels';
import { generateAiResult, type ChatMessage } from '@/core/llm/generateAiResult';
import { SingleLlmSelect } from '@/core/llm/SingleLlmSelect';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { createDefaultEditableEdgeData } from '../edges/EditableEdge';
import { useCanvasData } from '../CanvasDataContext';

export type AiStatus = 'not-started' | 'in-progress' | 'done';

export type AiNodeData = {
  label: string;
  isTyping?: boolean;
  model?: AiModel;
  status?: AiStatus;
  result?: string;
  fontSizeMode?: FontSizeMode;
  fontSizeValue?: number;
};

export type AiNodeType = Node<AiNodeData, 'ai-node'>;

const MIN_WIDTH = 240;
const MIN_HEIGHT = 180;
const NODE_HORIZONTAL_GAP = 80;

const htmlToPlainText = (value: string): string =>
  value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const aiNodeFormSchema = z.object({
  model: z.enum(Object.keys(AI_MODELS) as [string, ...string[]]),
  prompt: z.string(),
});

type AiNodeFormValues = z.infer<typeof aiNodeFormSchema>;

export const aiNodeDrawable: DrawableNode<AiNodeType> = {
  onPaneMouseDown: (id, position) => ({
    id,
    type: 'ai-node',
    position,
    data: {
      label: '',
      isTyping: false,
      model: 'deepseek',
      status: 'not-started',
      result: '',
      fontSizeMode: 'auto',
      fontSizeValue: DEFAULT_FONT_SIZE,
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
    const width = Math.max(Number(node.style?.width ?? node.width ?? 0), MIN_WIDTH);
    const height = Math.max(Number(node.style?.height ?? node.height ?? 0), MIN_HEIGHT);

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
        isTyping: true,
      },
    };
  },
};

const STATUS_LABELS: Record<AiStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  done: 'Done',
};

const STATUS_STYLES: Record<AiStatus, string> = {
  'not-started': 'bg-slate-100 text-slate-700',
  'in-progress': 'bg-amber-100 text-amber-800',
  done: 'bg-emerald-100 text-emerald-800',
};

const AiNode = memo(({ id, data, selected }: NodeProps<AiNodeType>) => {
  const { setNodes, setEdges, getNodes, getEdges } = useCanvasData();
  const contentRef = useRef<HTMLDivElement>(null);
  const { editor, isTyping, handleDoubleClick, handleBlur, updateNodeData } = useNodeAsEditor({
    id,
    data,
  });
  const model = data.model ?? 'deepseek';
  const status = data.status ?? 'not-started';
  const result = data.result ?? '';
  const label = data.label ?? '';
  const fontSizeValue = data.fontSizeValue ?? DEFAULT_FONT_SIZE;

  const form = useForm<AiNodeFormValues>({
    resolver: zodResolver(aiNodeFormSchema),
    values: {
      model,
      prompt: label,
    },
  });

  const watchedModel = form.watch('model');
  useEffect(() => {
    if (data.model !== watchedModel) {
      updateNodeData({ model: watchedModel as AiModel });
    }
  }, [watchedModel, updateNodeData, data.model]);

  const [isPromptOpen, setPromptOpen] = useState(false);
  const requestIdRef = useRef(0);
  const lastPromptRef = useRef(label);
  const wasTypingRef = useRef(isTyping);

  const buildChatHistory = useCallback(
    (promptHtml: string): ChatMessage[] => {
      const flowNodes = getNodes();
      const flowEdges = getEdges();

      const nodeMap = new Map(flowNodes.map((node) => [node.id, node] as const));
      const incomingMap = new Map<string, Edge[]>();

      flowEdges.forEach((edge) => {
        if (!edge.target) {
          return;
        }
        const existing = incomingMap.get(edge.target);
        if (existing) {
          existing.push(edge);
        } else {
          incomingMap.set(edge.target, [edge]);
        }
      });

      const visited = new Set<string>();

      const collectFromNode = (nodeId: string): ChatMessage[] => {
        if (visited.has(nodeId)) {
          return [];
        }

        visited.add(nodeId);
        const node = nodeMap.get(nodeId);
        if (!node || node.type !== 'ai-node') {
          return [];
        }

        const messagesBefore = (incomingMap.get(nodeId) ?? []).flatMap((incomingEdge) => {
          const sourceId = incomingEdge.source;
          if (typeof sourceId !== 'string') {
            return [];
          }

          return collectFromNode(sourceId);
        });

        const nodeData = node.data as AiNodeData | undefined;
        const promptText = htmlToPlainText(nodeData?.label ?? '');
        const resultText = (nodeData?.result ?? '').trim();

        const messages: ChatMessage[] = [];
        if (promptText) {
          messages.push({ role: 'user', content: promptText });
        }
        if (resultText) {
          messages.push({ role: 'assistant', content: resultText });
        }

        return [...messagesBefore, ...messages];
      };

      const history = (incomingMap.get(id) ?? []).flatMap((edge) => {
        const sourceId = edge.source;
        if (typeof sourceId !== 'string') {
          return [];
        }

        return collectFromNode(sourceId);
      });
      const promptText = htmlToPlainText(promptHtml);

      if (promptText) {
        history.push({ role: 'user', content: promptText });
      }

      return history;
    },
    [getEdges, getNodes, id],
  );

  const handleCreateSplit = useCallback(() => {
    const flowNodes = getNodes();
    const currentNode = flowNodes.find((node) => node.id === id);

    if (!currentNode) {
      return;
    }

    const width = Number(currentNode.width ?? currentNode.style?.width ?? MIN_WIDTH);
    const newNodeId = crypto.randomUUID();
    const newPosition = {
      x: currentNode.position.x + width + NODE_HORIZONTAL_GAP,
      y: currentNode.position.y,
    };

    const currentNodeData = currentNode.data as AiNodeData | undefined;
    const newNodeData: AiNodeData = {
      label: '',
      isTyping: true,
      model: currentNodeData?.model ?? model,
      status: 'not-started',
      result: '',
    };

    setNodes((existing) => {
      const clearedSelection = existing.map((node) => {
        if (node.id === id && node.type === 'ai-node') {
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
          type: 'ai-node',
          position: newPosition,
          data: newNodeData,
          width: MIN_WIDTH,
          height: MIN_HEIGHT,
          style: { width: MIN_WIDTH, height: MIN_HEIGHT },
          selected: true,
        } as AiNodeType,
      ];
    });

    setEdges((prevEdges) => [
      ...prevEdges,
      {
        id: crypto.randomUUID(),
        source: id,
        sourceHandle: 'right-source',
        target: newNodeId,
        targetHandle: 'left-target',
        type: 'editable',
        data: createDefaultEditableEdgeData(),
      },
    ]);
  }, [getNodes, id, model, setEdges, setNodes]);

  const renderPromptContent = useMemo(
    () => (
      <div
        className={cn(
          'prose prose-sm w-full max-w-none',
          'prose-h1:text-xl prose-h1:leading-tight',
          'prose-h2:text-lg prose-h2:leading-snug',
          'prose-h3:text-base prose-h3:leading-snug',
          'prose-p:my-1 prose-p:leading-normal',
          'prose-ul:my-1 prose-ol:my-1',
          'prose-li:my-0',
          'min-h-[1.5rem] px-3 py-2',
          'text-slate-900',
          'break-words',
        )}
        style={{ fontSize: `${fontSizeValue}px` }}
        dangerouslySetInnerHTML={{ __html: label || '<p>No prompt yet.</p>' }}
      />
    ),
    [label, fontSizeValue],
  );

  const runPrompt = useCallback(
    async (prompt: string) => {
      const promptText = htmlToPlainText(prompt);
      if (!promptText) {
        lastPromptRef.current = prompt;
        updateNodeData({ status: 'not-started', result: '' });
        return;
      }

      const currentRequestId = requestIdRef.current + 1;
      requestIdRef.current = currentRequestId;
      updateNodeData({ status: 'in-progress', result: '' });

      try {
        const messages = buildChatHistory(prompt);

        await generateAiResult({
          model,
          messages,
          onChunk: (chunk) => {
            if (requestIdRef.current === currentRequestId) {
              setNodes((nodes) =>
                nodes.map((n) => {
                  if (n.id === id) {
                    return {
                      ...n,
                      data: {
                        ...n.data,
                        result: (n.data.result ?? '') + chunk,
                      },
                    };
                  }
                  return n;
                }),
              );
            }
          },
        });

        if (requestIdRef.current === currentRequestId) {
          updateNodeData({ status: 'done' });
          lastPromptRef.current = prompt;
        }
      } catch (error) {
        console.error('Failed to generate AI result', error);

        if (requestIdRef.current === currentRequestId) {
          updateNodeData({
            status: 'done',
            result:
              'Unable to generate a response. Please verify your API configuration and try again.',
          });
          lastPromptRef.current = prompt;
        }
      }
    },
    [buildChatHistory, id, model, setNodes, updateNodeData],
  );

  useEffect(() => {
    if (wasTypingRef.current && !isTyping) {
      if (label !== lastPromptRef.current && label !== '') {
        void runPrompt(label);
      }
    }

    wasTypingRef.current = isTyping;
  }, [isTyping, label, runPrompt]);

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
  }, [id, setNodes, result]);

  const resultHtml = useMemo(() => {
    const response = marked.parse(result || '');
    return response;
  }, [result]);

  return (
    <NodeInteractionOverlay
      nodeId={id}
      isActive={selected}
      isEditing={isTyping}
      minWidth={MIN_WIDTH}
      minHeight={MIN_HEIGHT}
      className="text-slate-900"
      editor={editor}
    >
      <button
        type="button"
        aria-label="Branch prompt"
        className="absolute -right-3 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow transition hover:bg-slate-100"
        onClick={(event) => {
          event.stopPropagation();
          handleCreateSplit();
        }}
      >
        <Split className="h-3.5 w-3.5" />
      </button>
      <div
        ref={contentRef}
        className="flex h-full w-full flex-col gap-3 rounded-lg border border-border bg-white p-3 shadow"
        onDoubleClick={handleDoubleClick}
        onBlur={handleBlur}
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
                    <FormLabel className="text-xs font-medium text-slate-600">Model</FormLabel>
                    <FormControl>
                      <SingleLlmSelect value={field.value} onChange={field.onChange} />
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
                    <FormLabel className="text-xs font-medium text-slate-600">Prompt</FormLabel>
                    <FormControl className="mt-1 min-h-[120px] flex-1">
                      <div className="h-full overflow-hidden rounded-md border border-slate-300">
                        <MinimalTiptap
                          editor={editor}
                          theme="transparent"
                          className="h-full w-full"
                          style={{ fontSize: `${fontSizeValue}px` }}
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
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
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
                <span className="text-xs text-slate-500">{isPromptOpen ? 'Hide' : 'Show'}</span>
              </button>
              {isPromptOpen && (
                <div className="border-t border-slate-200">{renderPromptContent}</div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Result</span>
              <div
                className={cn(
                  'min-h-[120px] w-full rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm',
                  result ? 'text-slate-900' : 'text-slate-500',
                )}
              >
                <div dangerouslySetInnerHTML={{ __html: resultHtml }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </NodeInteractionOverlay>
  );
});

AiNode.displayName = 'AiNode';

export default AiNode;
