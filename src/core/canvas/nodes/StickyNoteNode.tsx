import React, { memo, useCallback, useMemo, useRef } from 'react';
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
import {
  SimpleColorPicker,
  type ColorStyle,
} from '@/components/ui/simple-color-picker';
import { DEFAULT_FONT_SIZE, type FontSizeMode } from '@/components/ui/minimal-tiptap/FontSizePlugin';
import { useAutoFontSizeObserver } from './useAutoFontSizeObserver';

export type StickyNoteData = {
  label: string;
  isTyping?: boolean;
  color?: ColorStyle;
  fontSizeMode?: FontSizeMode;
  fontSizeValue?: number;
};

export type StickyNoteNodeType = Node<StickyNoteData, 'sticky-note'>;

const MIN_WIDTH = 100;
const MIN_HEIGHT = 30;

const defaultColor: ColorStyle = {
  background: '#ffe83f',
  border: '#E6D038',
  text: '#000000',
};

export const stickyNoteDrawable: DrawableNode<StickyNoteNodeType> = {
  onPaneMouseDown: (id, position) => ({
    id,
    type: 'sticky-note',
    position,
    data: {
      label: '',
      isTyping: false,
      color: defaultColor,
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
        isTyping: true,
      },
    };
  },
};

const StickyNoteNode = memo(
  ({ id, data, selected }: NodeProps<StickyNoteNodeType>) => {
    const { editor, isTyping, handleDoubleClick, handleBlur, updateNodeData } =
      useNodeAsEditor({ id, data });
    const label = data.label ?? '';
    const color = data.color ?? defaultColor;
    const fontSizeMode = data.fontSizeMode ?? 'auto';
    const fontSizeValue = data.fontSizeValue ?? DEFAULT_FONT_SIZE;
    const containerRef = useRef<HTMLDivElement>(null);
    const measurementRef = useRef<HTMLDivElement>(null);
    const displayHtml = useMemo(
      () => label || '<p>Click to add text</p>',
      [label],
    );

    useAutoFontSizeObserver({
      editor,
      mode: fontSizeMode,
      html: displayHtml,
      containerRef,
      measurementRef,
    });

    const handleColorChange = useCallback(
      (value: ColorStyle) => {
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
            <SimpleColorPicker color={color} setColor={handleColorChange} />
          ),
        },
      ],
      [color, handleColorChange],
    );

    return (
      <NodeInteractionOverlay
        nodeId={id}
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
          )}
          style={{
            backgroundColor: color.background,
            borderColor: color.border,
          }}
          onDoubleClick={handleDoubleClick}
          onBlur={handleBlur}
          role="presentation"
        >
          <div className={cn('flex h-full w-full')} style={{ color: color.text }}>
            <div ref={containerRef} className="relative h-full w-full">
              {isTyping ? (
                <div
                  className="h-full w-full"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <MinimalTiptap
                    editor={editor}
                    theme="transparent"
                    className={cn('h-full w-full')}
                    style={{ color: color.text, fontSize: `${fontSizeValue}px` }}
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
                    'break-words',
                  )}
                  style={{
                    '--tw-prose-body': color.text,
                    '--tw-prose-headings': color.text,
                    '--tw-prose-links': color.text,
                    '--tw-prose-bold': color.text,
                    '--tw-prose-counters': color.text,
                    '--tw-prose-bullets': color.text,
                    '--tw-prose-hr': color.border,
                    '--tw-prose-quotes': color.text,
                    '--tw-prose-quote-borders': color.border,
                    '--tw-prose-captions': color.text,
                    color: color.text,
                    fontSize: `${fontSizeValue}px`,
                  }}
                  dangerouslySetInnerHTML={{
                    __html: displayHtml,
                  }}
                />
              )}

              <div
                ref={measurementRef}
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-0 box-border overflow-hidden opacity-0',
                  'prose prose-sm w-full max-w-none',
                  'prose-h1:text-xl prose-h1:leading-tight',
                  'prose-h2:text-lg prose-h2:leading-snug',
                  'prose-h3:text-base prose-h3:leading-snug',
                  'prose-p:my-1 prose-p:leading-normal',
                  'prose-ul:my-1 prose-ol:my-1',
                  'prose-li:my-0',
                  'min-h-[1.5rem] px-3 py-2',
                  'break-words',
                )}
                style={{
                  '--tw-prose-body': color.text,
                  '--tw-prose-headings': color.text,
                  '--tw-prose-links': color.text,
                  '--tw-prose-bold': color.text,
                  '--tw-prose-counters': color.text,
                  '--tw-prose-bullets': color.text,
                  '--tw-prose-hr': color.border,
                  '--tw-prose-quotes': color.text,
                  '--tw-prose-quote-borders': color.border,
                  '--tw-prose-captions': color.text,
                }}
                dangerouslySetInnerHTML={{
                  __html: displayHtml,
                }}
              />
            </div>
          </div>
        </div>
      </NodeInteractionOverlay>
    );
  },
);

StickyNoteNode.displayName = 'StickyNoteNode';

export default StickyNoteNode;
