import React, { memo, useMemo, useRef } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';

import NodeInteractionOverlay from './NodeInteractionOverlay';
import { type DrawableNode } from './DrawableNode';
import { MinimalTiptap } from '@/components/ui/minimal-tiptap';
import { cn } from '@/utils/tailwind';
import { useNodeAsEditor } from '@/helpers/useNodeAsEditor';
import { DEFAULT_FONT_SIZE, type FontSizeMode } from '@/components/ui/minimal-tiptap/FontSizePlugin';
import { useAutoFontSizeObserver } from './useAutoFontSizeObserver';

/** Data structure for text nodes with rich text editing capabilities */
export type TextNodeData = {
  label: string;
  isTyping?: boolean;
  fontSizeMode?: FontSizeMode;
  fontSizeValue?: number;
};

export type TextNode = Node<TextNodeData, 'text-node'>;

const MIN_WIDTH = 80;
const MIN_HEIGHT = 32;

/**
 * Implements DrawableNode interface for creating text nodes via drag interaction.
 * Nodes start in typing mode after creation for immediate text input.
 */
export const textDrawable: DrawableNode<TextNode> = {
  onPaneMouseDown: (id, position) => ({
    id,
    type: 'text-node',
    position,
    data: {
      label: '',
      isTyping: false,
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
        isTyping: true, // Auto-activate typing mode for immediate editing
      },
    };
  },
};

/**
 * Renders a rich text node on the canvas.
 * - Supports markdown-style formatting (headings, lists, bold, etc.)
 * - Auto-scales font size to fit content when in 'auto' mode
 * - Toggles between edit mode (TipTap editor) and display mode (rendered HTML)
 * - Double-click to enter edit mode
 */
const TextNodeComponent = memo(({ id, data, selected }: NodeProps<TextNode>) => {
  const { editor, isTyping, handleDoubleClick, handleBlur } = useNodeAsEditor({ id, data });
  const label = data.label ?? '';
  const fontSizeMode = data.fontSizeMode ?? 'auto';
  const fontSizeValue = data.fontSizeValue ?? DEFAULT_FONT_SIZE;
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Hidden measurement element for calculating optimal font size
  const measurementRef = useRef<HTMLDivElement>(null);
  
  const displayHtml = useMemo(
    () => label || '<p>Click to add text</p>',
    [label],
  );

  // Dynamically adjust font size when in auto mode based on container dimensions
  useAutoFontSizeObserver({
    editor,
    mode: fontSizeMode,
    html: displayHtml,
    containerRef,
    measurementRef,
  });

  return (
    <NodeInteractionOverlay
      nodeId={id}
      isActive={selected}
      isEditing={isTyping}
      minWidth={MIN_WIDTH}
      minHeight={MIN_HEIGHT}
      className="text-slate-900"
      editor={editor}
      contextMenuItems={undefined}
    >
      <div
        className="relative flex h-full w-full cursor-text items-center"
        onDoubleClick={handleDoubleClick}
        onBlur={handleBlur}
        role="presentation"
      >
        <div ref={containerRef} className="relative h-full w-full">
          {isTyping ? (
            // Stop propagation to prevent node dragging while editing
            <div className="h-full w-full" onMouseDown={(e) => e.stopPropagation()}>
              <MinimalTiptap
                editor={editor}
                theme="transparent"
                className="h-full w-full"
                style={{ fontSize: `${fontSizeValue}px` }}
              />
            </div>
          ) : (
            // Rendered view with prose styles for readable typography
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
              dangerouslySetInnerHTML={{ __html: displayHtml }}
            />
          )}

          {/* Hidden measurement element with identical styling for font size calculation */}
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
            dangerouslySetInnerHTML={{ __html: displayHtml }}
          />
        </div>
      </div>
    </NodeInteractionOverlay>
  );
});

TextNodeComponent.displayName = 'TextNode';

export default TextNodeComponent;
