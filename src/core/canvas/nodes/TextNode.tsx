import React, { memo } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';

import NodeInteractionOverlay from './NodeInteractionOverlay';
import { type DrawableNode } from './DrawableNode';
import { MinimalTiptap } from '@/components/ui/minimal-tiptap';
import { cn } from '@/utils/tailwind';
import { useNodeAsEditor } from '@/helpers/useNodeAsEditor';

export type TextNodeData = {
  label: string;
  isTyping?: boolean;
};

export type TextNode = Node<TextNodeData, 'text-node'>;

const MIN_WIDTH = 80;
const MIN_HEIGHT = 32;

export const textDrawable: DrawableNode<TextNode> = {
  onPaneMouseDown: (id, position) => ({
    id,
    type: 'text-node',
    position,
    data: { label: '', isTyping: false },
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

const TextNodeComponent = memo(({ id, data, selected }: NodeProps<TextNode>) => {
  const { editor, isTyping, handleDoubleClick, handleBlur } = useNodeAsEditor({ id, data });
  const label = data.label ?? '';

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
        className="relative flex h-full w-full cursor-text items-center"
        onDoubleClick={handleDoubleClick}
        onBlur={handleBlur}
        role="presentation"
      >
        {isTyping ? (
          <div className="h-full w-full" onMouseDown={(e) => e.stopPropagation()}>
            <MinimalTiptap
              editor={editor}
              theme="transparent"
              className="h-full w-full"
            />
          </div>
        ) : (
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
            dangerouslySetInnerHTML={{ __html: label || '<p>Click to add text</p>' }}
          />
        )}
      </div>
    </NodeInteractionOverlay>
  );
});

TextNodeComponent.displayName = 'TextNode';

export default TextNodeComponent;
