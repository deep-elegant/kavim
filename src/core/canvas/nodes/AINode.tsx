import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import NodeInteractionOverlay from './NodeInteractionOverlay';
import { type DrawableNode } from './DrawableNode';
import { MinimalTiptap } from '@/components/ui/minimal-tiptap';
import { cn } from '@/utils/tailwind';
import { useNodeAsEditor } from '@/helpers/useNodeAsEditor';
import { AI_MODELS, type AiModel } from '../../llm/aiModels';
import { generateAiResult } from '@/core/llm/generateAiResult';
import { SingleLlmSelect } from '@/core/llm/SingleLlmSelect';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

export type AiStatus = 'not-started' | 'in-progress' | 'done';

export type AiNodeData = {
  label: string;
  isTyping?: boolean;
  model?: AiModel;
  status?: AiStatus;
  result?: string;
};

export type AiNodeType = Node<AiNodeData, 'ai-node'>;

const MIN_WIDTH = 240;
const MIN_HEIGHT = 180;

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
    data: { label: '', isTyping: false, model: 'deepseek', status: 'not-started', result: '' },
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
  const { editor, isTyping, handleDoubleClick, handleBlur, updateNodeData } = useNodeAsEditor({
    id,
    data,
  });
  const model = data.model ?? 'deepseek';
  const status = data.status ?? 'not-started';
  const result = data.result ?? '';
  const label = data.label ?? '';

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
        dangerouslySetInnerHTML={{ __html: label || '<p>No prompt yet.</p>' }}
      />
    ),
    [label],
  );

  const runPrompt = useCallback(
    async (prompt: string) => {
      const trimmedPrompt = prompt.trim();
      if (trimmedPrompt.length === 0) {
        lastPromptRef.current = prompt;
        updateNodeData({ status: 'not-started', result: '' });
        return;
      }

      const currentRequestId = requestIdRef.current + 1;
      requestIdRef.current = currentRequestId;
      updateNodeData({ status: 'in-progress' });

      try {
        const generated = await generateAiResult({ model, prompt: trimmedPrompt });

        if (requestIdRef.current === currentRequestId) {
          updateNodeData({ status: 'done', result: generated });
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
    [model, updateNodeData],
  );

  useEffect(() => {
    if (wasTypingRef.current && !isTyping) {
      if (label !== lastPromptRef.current && label !== '') {
        void runPrompt(label);
      }
    }

    wasTypingRef.current = isTyping;
  }, [isTyping, label, runPrompt]);

  return (
    <NodeInteractionOverlay
      isActive={selected}
      isEditing={isTyping}
      minWidth={MIN_WIDTH}
      minHeight={MIN_HEIGHT}
      className="text-slate-900"
      editor={editor}
    >
      <div
        className="flex h-full w-full flex-col gap-3 rounded-lg border border-border bg-white p-3 shadow"
        onDoubleClick={handleDoubleClick}
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
                {result || 'No result yet.'}
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
