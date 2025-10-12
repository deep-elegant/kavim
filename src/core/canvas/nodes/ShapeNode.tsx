import React, {
  memo,
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { type NodeProps, useReactFlow, type Node } from '@xyflow/react';

import { cn } from '@/utils/tailwind';

import NodeInteractionOverlay from './NodeInteractionOverlay';
import { type DrawableNode } from './DrawableNode';

export type ShapeType = 'circle' | 'rectangle';

export type ShapeNodeData = {
  label: string;
  shapeType: ShapeType;
  isTyping?: boolean;
};

export type ShapeNode = Node<ShapeNodeData, 'shape-node'>;

export const CIRCLE_MIN_SIZE = 80;
export const RECTANGLE_MIN_WIDTH = 120;
export const RECTANGLE_MIN_HEIGHT = 60;

export const shapeDrawable: DrawableNode<ShapeNode> = {
  onPaneMouseDown: (id, position) => ({
    id,
    type: 'shape-node',
    position,
    data: { label: '', shapeType: 'circle', isTyping: false },
    width: CIRCLE_MIN_SIZE,
    height: CIRCLE_MIN_SIZE,
    style: { width: CIRCLE_MIN_SIZE, height: CIRCLE_MIN_SIZE },
    selected: true,
  }),

  onPaneMouseMove: (node, start, current) => {
    const size = Math.max(
      Math.abs(current.x - start.x),
      Math.abs(current.y - start.y),
      CIRCLE_MIN_SIZE,
    );
    const position = {
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
    };

    return {
      ...node,
      position,
      width: size,
      height: size,
      style: {
        ...node.style,
        width: size,
        height: size,
      },
    };
  },

  onPaneMouseUp: (node) => {
    const size = Math.max(Number(node.style?.width ?? node.width ?? 0), CIRCLE_MIN_SIZE);

    return {
      ...node,
      width: size,
      height: size,
      style: {
        ...node.style,
        width: size,
        height: size,
      },
      data: {
        ...node.data,
        isTyping: true,
      },
    };
  },
};

const ShapeNodeComponent = memo(({ id, data, selected }: NodeProps<ShapeNode>) => {
  const { setNodes } = useReactFlow();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { label = '', isTyping = false, shapeType } = data;

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

  const minWidth = shapeType === 'circle' ? CIRCLE_MIN_SIZE : RECTANGLE_MIN_WIDTH;
  const minHeight = shapeType === 'circle' ? CIRCLE_MIN_SIZE : RECTANGLE_MIN_HEIGHT;
  const textAlignClass = shapeType === 'circle' ? 'text-center' : 'text-left';

  return (
    <NodeInteractionOverlay
      isActive={selected}
      isEditing={isTyping}
      minWidth={minWidth}
      minHeight={minHeight}
    >
      <div
        className={cn(
          'relative flex h-full w-full overflow-hidden border bg-white text-slate-900 shadow-sm transition-colors',
          shapeType === 'circle'
            ? 'rounded-full border-blue-300 bg-blue-50'
            : 'rounded-lg border-slate-300 bg-slate-50',
        )}
        onClick={handleClick}
        role="presentation"
      >
        {isTyping ? (
          <textarea
            ref={textareaRef}
            className={cn(
              'h-full w-full resize-none bg-transparent p-4 text-sm font-medium leading-relaxed text-slate-900 outline-none',
              textAlignClass,
            )}
            value={label}
            onChange={(event) => handleLabelChange(event.target.value)}
            onBlur={handleBlur}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
        ) : (
          <div
            className={cn(
              'flex h-full w-full overflow-hidden whitespace-pre-wrap break-words p-4 text-sm font-medium leading-relaxed text-slate-900',
              shapeType === 'circle'
                ? 'items-center justify-center text-center'
                : 'items-start justify-start text-left',
            )}
          >
            {label || 'Click to add text'}
          </div>
        )}
      </div>
    </NodeInteractionOverlay>
  );
});

ShapeNodeComponent.displayName = 'ShapeNode';

export default ShapeNodeComponent;
