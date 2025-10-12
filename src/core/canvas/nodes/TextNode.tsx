import React, {
  memo,
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { type NodeProps, useReactFlow, type Node } from '@xyflow/react';

import NodeInteractionOverlay from './NodeInteractionOverlay';
import { type DrawableNode } from './DrawableNode';

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
  const { setNodes } = useReactFlow();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const label = data.label ?? '';
  const isTyping = Boolean(data.isTyping);

  useEffect(() => {
    if (isTyping && textareaRef.current) {
      textareaRef.current.focus();
      const { length } = textareaRef.current.value;
      textareaRef.current.setSelectionRange(length, length);
    }
  }, [isTyping]);

  const setTypingState = (value: boolean) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              isTyping: value,
            },
          };
        }

        if (value && node.data?.isTyping) {
          return {
            ...node,
            data: {
              ...node.data,
              isTyping: false,
            },
          };
        }

        return node;
      }),
    );
  };

  const handleLabelChange = (value: string) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                label: value,
              },
            }
          : node,
      ),
    );
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!isTyping) {
      setTypingState(true);
    }
  };

  const handleBlur = () => {
    setTypingState(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.currentTarget.blur();
    }
  };

  return (
    <NodeInteractionOverlay
      isActive={selected}
      isEditing={isTyping}
      minWidth={MIN_WIDTH}
      minHeight={MIN_HEIGHT}
      className="text-slate-900"
    >
      <div
        className="relative flex h-full w-full cursor-text items-center"
        onClick={handleClick}
        role="presentation"
      >
        {isTyping ? (
          <textarea
            ref={textareaRef}
            className="h-full w-full resize-none bg-transparent text-base font-semibold leading-relaxed text-slate-900 outline-none"
            value={label}
            onChange={(event) => handleLabelChange(event.target.value)}
            onBlur={handleBlur}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
        ) : (
          <div className="w-full whitespace-pre-wrap break-words text-base font-semibold leading-relaxed text-slate-900">
            {label || 'Click to add text'}
          </div>
        )}
      </div>
    </NodeInteractionOverlay>
  );
});

TextNodeComponent.displayName = 'TextNode';

export default TextNodeComponent;
