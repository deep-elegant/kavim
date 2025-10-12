import React, { memo, useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { Handle, NodeResizer, Position, type NodeProps, useReactFlow, Node } from '@xyflow/react';

export type StickyNoteData = {
  label: string;
  isTyping?: boolean;
};

export type StickyNoteNode = Node<StickyNoteData, 'sticky-note'>;

const MIN_WIDTH = 100;
const MIN_HEIGHT = 30;

const StickyNoteNode = memo(({ id, data, selected }: NodeProps<StickyNoteNode>) => {
  const { setNodes } = useReactFlow();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isTyping = Boolean(data.isTyping);
  const label = data.label ?? '';

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

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.currentTarget.blur();
    }
  };

  const handleBlur = () => {
    setTypingState(false);
  };

  return (
    <div
      className="relative h-full w-full rounded-lg border border-yellow-400 bg-yellow-100 shadow"
      onClick={handleClick}
      role="presentation"
      style={{ minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT }}
    >
      <NodeResizer
        color="#facc15"
        isVisible={selected && !isTyping}
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        handleStyle={{ borderRadius: '9999px', width: 10, height: 10 }}
      />
      <Handle type="target" position={Position.Left} />
      <div className="flex h-full w-full">
        {isTyping ? (
          <textarea
            ref={textareaRef}
            className="h-full w-full resize-none bg-transparent p-2 text-sm font-medium leading-relaxed text-yellow-950 outline-none"
            value={label}
            onChange={(event) => handleLabelChange(event.target.value)}
            onBlur={handleBlur}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
        ) : (
          <div className="h-full w-full overflow-hidden whitespace-pre-wrap break-words p-2 text-sm font-medium leading-relaxed text-yellow-950">
            {label || 'Click to add text'}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

StickyNoteNode.displayName = 'StickyNoteNode';

export default StickyNoteNode;
