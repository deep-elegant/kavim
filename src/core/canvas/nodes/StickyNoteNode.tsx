import React, { memo, useCallback, useMemo } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';

import NodeInteractionOverlay from './NodeInteractionOverlay';
import { type DrawableNode } from './DrawableNode';
import { MinimalTiptap } from '@/components/ui/minimal-tiptap';
import {
  defaultToolbarItems,
  type ToolbarItem,
} from '@/components/ui/minimal-tiptap/TiptapToolbar';
import { cn } from '@/utils/tailwind';
import { useNodeAsEditor } from '@/helpers/useNodeAsEditor';

export type StickyNoteData = {
  label: string;
  isTyping?: boolean;
  color?: StickyNoteColor;
};

export type StickyNoteNode = Node<StickyNoteData, 'sticky-note'>;

export type StickyNoteColor = 'yellow' | 'red' | 'blue' | 'green' | 'pink';

const MIN_WIDTH = 100;
const MIN_HEIGHT = 30;

export const stickyNoteDrawable: DrawableNode<StickyNoteNode> = {
  onPaneMouseDown: (id, position) => ({
    id,
    type: 'sticky-note',
    position,
    data: { label: '', isTyping: false, color: 'yellow' },
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

const StickyNoteNode = memo(({ id, data, selected }: NodeProps<StickyNoteNode>) => {
  const { editor, isTyping, handleDoubleClick, handleBlur, updateNodeData } =
    useNodeAsEditor({ id, data });
  const label = data.label ?? '';
  const color = data.color ?? 'yellow';

  const colorStyles = STICKY_NOTE_COLOR_STYLES[color] ?? STICKY_NOTE_COLOR_STYLES.yellow;

  const handleColorChange = useCallback(
    (value: StickyNoteColor) => {
      updateNodeData({ color: value });
    },
    [updateNodeData],
  );

  const toolbarItems = useMemo<ToolbarItem[]>(
    () => [
      ...defaultToolbarItems,
      { type: 'separator', id: 'sticky-note-color-separator' },
      {
        type: 'custom',
        id: 'sticky-note-color-picker',
        render: () => (
          <StickyNoteColorSelector selectedColor={color} onSelect={handleColorChange} />
        ),
      },
    ],
    [color, handleColorChange],
  );

  return (
    <NodeInteractionOverlay
      isActive={selected}
      isEditing={isTyping}
      minWidth={MIN_WIDTH}
      minHeight={MIN_HEIGHT}
      editor={editor}
      toolbarItems={toolbarItems}
    >
      <div
        className={cn(
          'relative h-full w-full rounded-lg border shadow transition-colors',
          colorStyles.background,
          colorStyles.border,
        )}
        onDoubleClick={handleDoubleClick}
        onBlur={handleBlur}
        role="presentation"
      >
        <div className={cn('flex h-full w-full', colorStyles.text)}>
          {isTyping ? (
            <div className="h-full w-full" onMouseDown={(e) => e.stopPropagation()}>
              <MinimalTiptap
                editor={editor}
                theme="transparent"
                className={cn('h-full w-full', colorStyles.text)}
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
                colorStyles.text,
                'break-words',
              )}
              dangerouslySetInnerHTML={{ __html: label || '<p>Click to add text</p>' }}
            />
          )}
        </div>
      </div>
    </NodeInteractionOverlay>
  );
});

StickyNoteNode.displayName = 'StickyNoteNode';

export default StickyNoteNode;

const STICKY_NOTE_COLOR_STYLES: Record<StickyNoteColor, { border: string; background: string; text: string }> = {
  yellow: {
    border: 'border-yellow-400',
    background: 'bg-yellow-100',
    text: 'text-yellow-900',
  },
  red: {
    border: 'border-red-400',
    background: 'bg-red-100',
    text: 'text-red-900',
  },
  blue: {
    border: 'border-sky-400',
    background: 'bg-sky-100',
    text: 'text-sky-900',
  },
  green: {
    border: 'border-emerald-400',
    background: 'bg-emerald-100',
    text: 'text-emerald-900',
  },
  pink: {
    border: 'border-pink-400',
    background: 'bg-pink-100',
    text: 'text-pink-900',
  },
};

const STICKY_NOTE_COLOR_OPTIONS: { value: StickyNoteColor; label: string; swatch: string }[] = [
  { value: 'yellow', label: 'Yellow', swatch: 'bg-yellow-300' },
  { value: 'red', label: 'Red', swatch: 'bg-red-300' },
  { value: 'blue', label: 'Blue', swatch: 'bg-sky-300' },
  { value: 'green', label: 'Green', swatch: 'bg-emerald-300' },
  { value: 'pink', label: 'Pink', swatch: 'bg-pink-300' },
];

type StickyNoteColorSelectorProps = {
  selectedColor: StickyNoteColor;
  onSelect: (color: StickyNoteColor) => void;
};

const StickyNoteColorSelector = ({ selectedColor, onSelect }: StickyNoteColorSelectorProps) => (
  <div className="flex items-center gap-1">
    {STICKY_NOTE_COLOR_OPTIONS.map((option) => (
      <button
        key={option.value}
        type="button"
        className={cn(
          'relative h-5 w-5 rounded-full border-2 border-transparent transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          option.swatch,
          selectedColor === option.value && 'border-sky-500 ring-2 ring-sky-500/40',
        )}
        onClick={() => onSelect(option.value)}
        onMouseDown={(event) => event.preventDefault()}
      >
        <span className="sr-only">{option.label}</span>
      </button>
    ))}
  </div>
);
