import React, { memo, useCallback, useMemo, useRef } from "react";
import { type NodeProps, type Node } from "@xyflow/react";

import NodeInteractionOverlay from "./NodeInteractionOverlay";
import { type DrawableNode } from "./DrawableNode";
import { MinimalTiptap } from "@/components/ui/minimal-tiptap";
import {
  defaultToolbarItems,
  type ToolbarItem,
} from "@/components/ui/minimal-tiptap/TiptapToolbar";
import { cn } from "@/utils/tailwind";
import { useNodeAsEditor } from "@/helpers/useNodeAsEditor";
import {
  SimpleColorPicker,
  type ColorStyle,
} from "@/components/ui/simple-color-picker";
import { type FontSizeSetting } from "@/components/ui/minimal-tiptap/FontSizePlugin";
import { useAutoFontSizeObserver } from "./useAutoFontSizeObserver";
import { useCanvasUndoRedo } from "../undo";

/** Data structure for sticky notes with color theming and font sizing */
export type StickyNoteData = {
  label: string;
  isTyping?: boolean; // UI-only flag, not synced to Yjs
  color?: ColorStyle;
  fontSize?: FontSizeSetting;
};

export type StickyNoteNodeType = Node<StickyNoteData, "sticky-note">;

/**
 * Sticky note sizing heuristics.
 * - Default size keeps new notes readable when created with a click-release gesture.
 * - Minimum size allows users to shrink notes for lightweight annotations.
 */
const DEFAULT_NOTE_SIZE = 140;
const MIN_NOTE_SIZE = 20;
/** Minimum sticky note footprint; default spawn size stays larger for readability. */
const MIN_WIDTH = MIN_NOTE_SIZE;
const MIN_HEIGHT = MIN_NOTE_SIZE;
const DRAG_ACTIVATION_THRESHOLD = 4; // Ignore tiny pointer jitters so click-release uses the default size.
const NOTE_PADDING_X = 8; // Matches Tailwind px-2 in content containers
const NOTE_PADDING_Y = 6; // Matches Tailwind py-1.5 in content containers
const NOTE_AUTO_FONT_MIN = 10;
const NOTE_AUTO_FONT_RATIO = 0.7;
const NOTE_LINE_HEIGHT = 1.2;

/** Classic sticky note yellow - provides familiar UX for quick notes */
const defaultColor: ColorStyle = {
  background: "#ffe83f",
  border: "#E6D038",
  text: "#000000",
};

/**
 * Implements drag-to-create behavior for sticky notes.
 * Users draw a rectangle on canvas, then it auto-enters typing mode.
 */
export const stickyNoteDrawable: DrawableNode<StickyNoteNodeType> = {
  onPaneMouseDown: (id, position) => ({
    id,
    type: "sticky-note",
    position,
    data: {
      label: "",
      isTyping: false,
      color: defaultColor,
      fontSize: "auto",
    },
    width: DEFAULT_NOTE_SIZE,
    height: DEFAULT_NOTE_SIZE,
    style: { width: DEFAULT_NOTE_SIZE, height: DEFAULT_NOTE_SIZE },
    selected: true,
  }),

  onPaneMouseMove: (node, start, current) => {
    const deltaX = Math.abs(current.x - start.x);
    const deltaY = Math.abs(current.y - start.y);
    // Only transition into resize mode once the pointer meaningfully moves away from the origin.
    const hasDragged =
      Math.max(deltaX, deltaY) >= DRAG_ACTIVATION_THRESHOLD;

    if (!hasDragged) {
      return node;
    }

    const width = Math.max(deltaX, MIN_WIDTH);
    const height = Math.max(deltaY, MIN_HEIGHT);
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
        isTyping: true, // Auto-focus for immediate text input
      },
    };
  },
};

/**
 * Renders a color-themeable sticky note with rich text editing.
 * - Toggles between TipTap editor (typing mode) and rendered HTML (display mode).
 * - Auto-scales font size to fit content within the note bounds.
 * - Includes color picker in toolbar for quick theme changes.
 */
const StickyNoteNode = memo(
  ({ id, data, selected }: NodeProps<StickyNoteNodeType>) => {
    const {
      editor,
      isTyping,
      handleDoubleClick,
      handleBlur,
      updateNodeData,
      fontSizeSetting,
      resolvedFontSize,
    } = useNodeAsEditor({ id, data });
    // Get the `performAction` function to wrap mutations in undoable actions.
    const { performAction } = useCanvasUndoRedo();
    const label = data.label ?? "";
    const color = data.color ?? defaultColor;
    const containerRef = useRef<HTMLDivElement>(null);

    // Hidden element used to measure rendered text dimensions for auto-sizing
    const measurementRef = useRef<HTMLDivElement>(null);

    const displayHtml = useMemo(
      () => label || "<p>Click to add text</p>",
      [label],
    );

    /**
     * Derives an upper bound for auto font sizing based on the current note geometry.
     * - Subtracts padding so the computed size reflects the actual drawable area.
     * - Scales proportionally to keep text legible across very small notes.
     */
    const getAutoFontCap = useCallback(
      ({ width, height }: { width: number; height: number }) => {
        const usableWidth = Math.max(
          Math.min(width - NOTE_PADDING_X * 2, width),
          NOTE_AUTO_FONT_MIN,
        );
        const usableHeight = Math.max(
          Math.min(height - NOTE_PADDING_Y * 2, height),
          NOTE_AUTO_FONT_MIN,
        );
        const available = Math.min(usableWidth, usableHeight);
        const scaled = Math.floor(available * NOTE_AUTO_FONT_RATIO);
        return Math.max(NOTE_AUTO_FONT_MIN, scaled);
      },
      [],
    );

    useAutoFontSizeObserver({
      editor,
      fontSize: fontSizeSetting,
      html: displayHtml,
      containerRef,
      measurementRef,
      maxSize: getAutoFontCap,
    });

    const handleColorChange = useCallback(
      (value: ColorStyle) => {
        // Wrap the color change in `performAction` to make it undoable.
        performAction(() => {
          updateNodeData({ color: value });
        }, "sticky-note-color");
      },
      [performAction, updateNodeData],
    );

    // Extend default formatting tools (bold, italic, etc.) with color picker
    const toolbarItems = useMemo<ToolbarItem[]>(
      () => [
        ...defaultToolbarItems,
        { type: "separator", id: "sticky-note-color-separator" },
        {
          type: "custom",
          id: "sticky-note-color-picker",
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
        contextMenuItems={undefined}
      >
        <div
          className={cn(
            "relative h-full w-full rounded-lg border shadow transition-colors",
          )}
          style={{
            backgroundColor: color.background,
            borderColor: color.border,
          }}
          onDoubleClick={handleDoubleClick}
          onBlur={handleBlur}
          role="presentation"
        >
          <div
            className={cn("flex h-full w-full")}
            style={{ color: color.text }}
          >
            <div ref={containerRef} className="relative h-full w-full">
              {isTyping ? (
                <div
                  className="h-full w-full"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <MinimalTiptap
                    editor={editor}
                    theme="transparent"
                    className={cn(
                      "h-full w-full leading-tight",
                      "[&_.ProseMirror]:min-h-0",
                      "[&_.ProseMirror]:px-2",
                      "[&_.ProseMirror]:py-1.5",
                      "[&_.ProseMirror]:leading-[1.2]",
                    )}
                    style={{
                      color: color.text,
                      fontSize: `${resolvedFontSize}px`,
                      lineHeight: NOTE_LINE_HEIGHT,
                    }}
                  />
                </div>
              ) : (
                <div
                  className={cn(
                    "prose prose-sm w-full max-w-none leading-tight",
                    "prose-h1:text-xl prose-h1:leading-tight",
                    "prose-h2:text-lg prose-h2:leading-snug",
                    "prose-h3:text-base prose-h3:leading-snug",
                    "prose-p:my-1 prose-p:leading-tight",
                    "prose-ul:my-1 prose-ol:my-1",
                    "prose-li:my-0",
                    "min-h-0 px-2 py-1.5",
                    "break-words",
                  )}
                  style={{
                    "--tw-prose-body": color.text,
                    "--tw-prose-headings": color.text,
                    "--tw-prose-links": color.text,
                    "--tw-prose-bold": color.text,
                    "--tw-prose-counters": color.text,
                    "--tw-prose-bullets": color.text,
                    "--tw-prose-hr": color.border,
                    "--tw-prose-quotes": color.text,
                    "--tw-prose-quote-borders": color.border,
                    "--tw-prose-captions": color.text,
                    color: color.text,
                    fontSize: `${resolvedFontSize}px`,
                    lineHeight: NOTE_LINE_HEIGHT,
                  }}
                  dangerouslySetInnerHTML={{
                    __html: displayHtml,
                  }}
                />
              )}

              {/* Hidden clone of content with identical styles for measuring overflow */}
              <div
                ref={measurementRef}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 box-border overflow-hidden opacity-0",
                  "prose prose-sm w-full max-w-none leading-tight",
                  "prose-h1:text-xl prose-h1:leading-tight",
                  "prose-h2:text-lg prose-h2:leading-snug",
                  "prose-h3:text-base prose-h3:leading-snug",
                  "prose-p:my-1 prose-p:leading-tight",
                  "prose-ul:my-1 prose-ol:my-1",
                  "prose-li:my-0",
                  "min-h-0 px-2 py-1.5",
                  "break-words",
                )}
                style={{
                  "--tw-prose-body": color.text,
                  "--tw-prose-headings": color.text,
                  "--tw-prose-links": color.text,
                  "--tw-prose-bold": color.text,
                  "--tw-prose-counters": color.text,
                  "--tw-prose-bullets": color.text,
                  "--tw-prose-hr": color.border,
                  "--tw-prose-quotes": color.text,
                  "--tw-prose-quote-borders": color.border,
                  "--tw-prose-captions": color.text,
                  lineHeight: NOTE_LINE_HEIGHT,
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

StickyNoteNode.displayName = "StickyNoteNode";

export default StickyNoteNode;
