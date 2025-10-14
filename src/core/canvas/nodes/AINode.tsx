import React, { memo, useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';

import NodeInteractionOverlay from './NodeInteractionOverlay';
import { type DrawableNode } from './DrawableNode';
import { MinimalTiptap } from '@/components/ui/minimal-tiptap';
import { cn } from '@/utils/tailwind';
import { useNodeAsEditor } from '@/helpers/useNodeAsEditor';

const AI_MODELS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'chatgpt', label: 'ChatGPT' },
] as const;

type AiModel = (typeof AI_MODELS)[number]['value'];
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
  const { editor, isTyping, handleDoubleClick, handleBlur, updateNodeData } =
    useNodeAsEditor({ id, data });
  const model = data.model ?? 'deepseek';
  const status = data.status ?? 'not-started';
  const result = data.result ?? '';
  const label = data.label ?? '';

  const [isPromptOpen, setPromptOpen] = useState(false);

  const handleModelChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      updateNodeData({ model: event.target.value as AiModel });
    },
    [updateNodeData],
  );

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
        onBlur={handleBlur}
        role="presentation"
      >
        {isTyping ? (
          <div className="flex h-full w-full flex-col gap-3" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex flex-col gap-1">
              <label htmlFor={`ai-node-model-${id}`} className="text-xs font-medium text-slate-600">
                Model
              </label>
              <select
                id={`ai-node-model-${id}`}
                value={model}
                onChange={handleModelChange}
                className="h-9 rounded-md border border-slate-300 px-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              >
                {AI_MODELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex h-full flex-col">
              <span className="text-xs font-medium text-slate-600">Prompt</span>
              <div className="mt-1 min-h-[120px] flex-1 overflow-hidden rounded-md border border-slate-300">
                <MinimalTiptap editor={editor} theme="transparent" className="h-full w-full" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col gap-3" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Status</span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_STYLES[status])}>
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
              {isPromptOpen && <div className="border-t border-slate-200">{renderPromptContent}</div>}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Result</span>
              <div
                className={cn(
                  'min-h-[120px] w-full rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm',
                  result ? 'text-slate-900' : 'text-slate-500',
                )}
              >
                {result ? result : 'No result yet.'}
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
