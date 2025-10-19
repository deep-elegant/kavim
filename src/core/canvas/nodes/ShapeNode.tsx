import React, { memo, useCallback, useMemo, useRef } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';

import { cn } from '@/utils/tailwind';

import NodeInteractionOverlay from './NodeInteractionOverlay';
import { type DrawableNode } from './DrawableNode';
import { useNodeAsEditor } from '@/helpers/useNodeAsEditor';
import { MinimalTiptap } from '@/components/ui/minimal-tiptap';
import {
  defaultToolbarItems,
  type ToolbarItem,
} from '@/components/ui/minimal-tiptap/TiptapToolbar';
import {
  SimpleColorPicker,
  type ColorStyle,
} from '@/components/ui/simple-color-picker';
import { DEFAULT_FONT_SIZE, type FontSizeMode } from '@/components/ui/minimal-tiptap/FontSizePlugin';
import { useAutoFontSizeObserver } from './useAutoFontSizeObserver';

export type ShapeType = 'circle' | 'rectangle';

/** Data structure for shape nodes with customizable colors and text */
export type ShapeNodeData = {
  label: string;
  shapeType: ShapeType;
  isTyping?: boolean;
  color?: ColorStyle;
  fontSizeMode?: FontSizeMode;
  fontSizeValue?: number;
};

export type ShapeNode = Node<ShapeNodeData, 'shape-node'>;

export const CIRCLE_MIN_SIZE = 80;
export const RECTANGLE_MIN_WIDTH = 120;
export const RECTANGLE_MIN_HEIGHT = 60;

/** Default light blue theme for shape nodes */
const defaultColor: ColorStyle = {
  background: '#EFF6FF', // blue-50
  border: '#93C5FD', // blue-300
  text: '#1E293B', // slate-900
};

/**
 * Implements DrawableNode interface for creating shape nodes via drag interaction.
 * Creates square shapes by using the larger of width/height during drag (circles require 1:1 ratio).
 */
export const shapeDrawable: DrawableNode<ShapeNode> = {
  onPaneMouseDown: (id, position) => ({
    id,
    type: 'shape-node',
    position,
    data: {
      label: '',
      shapeType: 'circle',
      isTyping: false,
      color: defaultColor,
      fontSizeMode: 'auto',
      fontSizeValue: DEFAULT_FONT_SIZE,
    },
    width: CIRCLE_MIN_SIZE,
    height: CIRCLE_MIN_SIZE,
    style: { width: CIRCLE_MIN_SIZE, height: CIRCLE_MIN_SIZE },
    selected: true,
  }),

  onPaneMouseMove: (node, start, current) => {
    // Use max of both dimensions to maintain square aspect ratio (required for circle shape)
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
        isTyping: true, // Auto-activate typing mode for immediate text input
      },
    };
  },
};

/**
 * Renders a customizable shape node (circle or rectangle) with text overlay.
 * - User can customize background, border, and text colors via toolbar color picker
 * - Auto-scales font size to fit shape dimensions when in 'auto' mode
 * - Circle shapes center-align text, rectangles use left-align for readability
 * - Toggles between edit mode (TipTap editor) and display mode (rendered HTML)
 */
const ShapeNodeComponent = memo(({ id, data, selected }: NodeProps<ShapeNode>) => {
  const { editor, isTyping, handleDoubleClick, handleBlur, updateNodeData } =
    useNodeAsEditor({ id, data });
  const { label = '', shapeType } = data;
  const color = data.color ?? defaultColor;
  const fontSizeMode = data.fontSizeMode ?? 'auto';
  const fontSizeValue = data.fontSizeValue ?? DEFAULT_FONT_SIZE;
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Hidden measurement element for calculating optimal font size
  const measurementRef = useRef<HTMLDivElement>(null);
  
  const displayHtml = useMemo(
    () => label || '<p>Click to add text</p>',
    [label],
  );

  // Dynamically adjust font size when in auto mode based on shape dimensions
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

  // Add color picker to the standard toolbar for per-node color customization
  const toolbarItems = useMemo<ToolbarItem[]>(
    () => [
      ...defaultToolbarItems,
      { type: 'separator', id: 'shape-node-color-separator' },
      {
        type: 'custom',
        id: 'shape-node-color-picker',
        render: () => (
          <SimpleColorPicker color={color} setColor={handleColorChange} />
        ),
      },
    ],
    [color, handleColorChange],
  );

  // Use shape-specific minimum dimensions and text alignment
  const minWidth = shapeType === 'circle' ? CIRCLE_MIN_SIZE : RECTANGLE_MIN_WIDTH;
  const minHeight = shapeType === 'circle' ? CIRCLE_MIN_SIZE : RECTANGLE_MIN_HEIGHT;
  const textAlignClass = shapeType === 'circle' ? 'text-center' : 'text-left';

  return (
    <NodeInteractionOverlay
      nodeId={id}
      isActive={selected}
      isEditing={isTyping}
      minWidth={minWidth}
      minHeight={minHeight}
      editor={editor}
      toolbarItems={toolbarItems}
      contextMenuItems={undefined}
    >
      <div
        className={cn(
          'relative flex h-full w-full overflow-hidden border text-slate-900 shadow-sm transition-colors',
          shapeType === 'circle' ? 'rounded-full' : 'rounded-lg',
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
              // Stop propagation to prevent node dragging while editing
              <div
                className="h-full w-full"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <MinimalTiptap
                  editor={editor}
                  theme="transparent"
                  className={cn('h-full w-full', textAlignClass)}
                  style={{ color: color.text, fontSize: `${fontSizeValue}px` }}
                />
              </div>
            ) : (
              // Display mode with custom prose colors matching the shape's color scheme
              <div
                className={cn(
                  'prose prose-sm flex h-full w-full max-w-none items-center justify-center overflow-hidden whitespace-pre-wrap break-words p-4',
                  textAlignClass,
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

            {/* Hidden measurement element with identical styling for font size calculation */}
            <div
              ref={measurementRef}
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-0 box-border overflow-hidden opacity-0',
                'prose prose-sm flex h-full w-full max-w-none items-center justify-center overflow-hidden whitespace-pre-wrap break-words p-4',
                textAlignClass,
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
});

ShapeNodeComponent.displayName = 'ShapeNode';

export default ShapeNodeComponent;
