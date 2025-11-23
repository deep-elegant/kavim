import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { type NodeProps, type Node } from "@xyflow/react";
import { type Editor } from "@tiptap/react";

import NodeInteractionOverlay from "./NodeInteractionOverlay";
import { type DrawableNode } from "./DrawableNode";
import { MinimalTiptap } from "@/components/ui/minimal-tiptap";
import {
  defaultToolbarItems,
  type ToolbarItem,
} from "@/components/ui/minimal-tiptap/TiptapToolbar";
import { cn } from "@/utils/tailwind";
import {
  useClickToEditHandler,
  useNodeAsEditor,
  useEditorFocusAtClick,
} from "@/helpers/useNodeAsEditor";
import {
  SimpleColorPicker,
  type ColorStyle,
} from "@/components/ui/simple-color-picker";
import { ShapePicker } from "@/components/ui/ShapePicker";
import { type FontSizeSetting } from "@/components/ui/minimal-tiptap/FontSizePlugin";
import { useAutoFontSizeObserver } from "./useAutoFontSizeObserver";
import { useCanvasUndoRedo } from "../undo";
import { Z } from "./nodesZindex";

/** Data structure for sticky notes with color theming and font sizing */
export type StickyNoteShape =
  | "rectangle"
  | "diamond"
  | "triangle"
  | "ellipse";

export type StickyNoteData = {
  label: string;
  isTyping?: boolean; // UI-only flag, not synced to Yjs
  color?: ColorStyle;
  fontSize?: FontSizeSetting;
  shape?: StickyNoteShape;
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
      shape: "rectangle",
    },
    width: DEFAULT_NOTE_SIZE,
    height: DEFAULT_NOTE_SIZE,
    style: { width: DEFAULT_NOTE_SIZE, height: DEFAULT_NOTE_SIZE },
    selected: true,
    zIndex: Z.CONTENT_BASE,
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
    const { handleStartEditing, handleFocus } = useEditorFocusAtClick();

    const {
      editor,
      isTyping,
      handleDoubleClick,
      handleBlur: handleEditorBlur,
      updateNodeData,
      setTypingState,
      fontSizeSetting,
      resolvedFontSize,
    } = useNodeAsEditor({ id, data, onFocus: handleFocus });
    const handleClickToEdit = useClickToEditHandler(
      selected,
      isTyping,
      setTypingState,
      handleStartEditing,
    );
    // Get the `performAction` function to wrap mutations in undoable actions.
    const { performAction } = useCanvasUndoRedo();
    const label = data.label ?? "";
    const color = data.color ?? defaultColor;
    const shape = data.shape ?? "rectangle";
    const containerRef = useRef<HTMLDivElement>(null);

    // Hidden element used to measure rendered text dimensions for auto-sizing
    const measurementRef = useRef<HTMLDivElement>(null);
    // Tracks temporary blur events triggered by drag/resize interactions while editing.
    const editingInteractionGuardRef = useRef(false);

    // Clear the blur guard whenever we leave typing mode.
    useEffect(() => {
      if (!isTyping) {
        editingInteractionGuardRef.current = false;
      }
    }, [isTyping]);

    // Exit typing when the sticky note is deselected so Delete removes the node.
    useEffect(() => {
      if (!selected && isTyping) {
        setTypingState(false);
      }
    }, [isTyping, selected, setTypingState]);

    // Ignore blur events triggered by drag/resize while we are mid-interaction.
    const handleBlur = useCallback(
      (event: React.FocusEvent<HTMLDivElement>) => {
        if (editingInteractionGuardRef.current) {
          return;
        }
        handleEditorBlur(event);
      },
      [handleEditorBlur],
    );

    // Mark the note as "temporarily leaving focus" for drag/resize operations.
    const handleEditingInteractionStart = useCallback(() => {
      if (!isTyping) {
        return;
      }
      editingInteractionGuardRef.current = true;
    }, [isTyping]);

    // Restore focus to the editor once the pointer is released after a move/resize.
    const handleEditingInteractionEnd = useCallback(() => {
      if (!editingInteractionGuardRef.current) {
        return;
      }

      editingInteractionGuardRef.current = false;
      if (!isTyping) {
        return;
      }

      requestAnimationFrame(() => {
        if (!editor) {
          return;
        }
        editor.commands.focus(undefined, { scrollIntoView: false });
      });
    }, [editor, isTyping]);

    // Switch into typing mode from a key press and replace any existing content.
    const startTypingFromKey = useCallback(
      (initialText: string | null) => {
        setTypingState(true);
        editingInteractionGuardRef.current = false;

        requestAnimationFrame(() => {
          if (!editor) {
            return;
          }

          editor.commands.setContent("", true);
          const chain = editor.chain().focus(undefined, {
            scrollIntoView: false,
          });

          if (initialText) {
            chain.insertContent(initialText);
          }

          chain.run();
        });
      },
      [editor, setTypingState],
    );

    // When selected but not typing, capture printable keys and restart the editor fresh.
    useEffect(() => {
      if (!selected || isTyping) {
        return;
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        if (
          target?.closest("input, textarea, select, [contenteditable='true']")
        ) {
          return;
        }

        if (event.defaultPrevented) {
          return;
        }

        if (event.metaKey || event.ctrlKey) {
          return;
        }

        const { key } = event;

        const isCharacterKey = key.length === 1;
        const isEnter = key === "Enter";

        if (!isCharacterKey && !isEnter) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const initialText = isEnter ? null : key;
        startTypingFromKey(initialText);
      };

      window.addEventListener("keydown", handleKeyDown, { capture: false });
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, [isTyping, selected, startTypingFromKey]);

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

    const handleShapeChange = useCallback(
      (newShape: StickyNoteShape) => {
        performAction(() => {
          updateNodeData({ shape: newShape });
        }, "sticky-note-shape");
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
        { type: "separator", id: "sticky-note-shape-separator" },
        {
          type: "custom",
          id: "sticky-note-shape-picker",
          render: () => (
            <ShapePicker shape={shape} onShapeChange={handleShapeChange} />
          ),
        },
      ],
      [color, handleColorChange, shape, handleShapeChange],
    );

    const textContainerStyles = useMemo(() => {
      switch (shape) {
        case "triangle":
          return {
            position: "absolute",
            top: "50%",
            left: "30%",
            width: "40%",
            height: "50%",
          };
        case "diamond":
          return {
            position: "absolute",
            top: "25%",
            left: "25%",
            width: "50%",
            height: "50%",
          };
        case "ellipse":
          return {
            position: "absolute",
            top: "15%",
            left: "15%",
            width: "70%",
            height: "70%",
          };
        case "rectangle":
        default:
          return {
            position: "relative",
            width: "100%",
            height: "100%",
          };
      }
    }, [shape]);

    const shapeStyles = useMemo(() => {
      switch (shape) {
        case "ellipse":
          return {
            clipPath: "ellipse(50% 50% at 50% 50%)",
          };
        case "diamond":
          return {
            clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
          };
        case "triangle":
          return {
            clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
          };
        default:
          return {};
      }
    }, [shape]);

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
        onEditingInteractionStart={handleEditingInteractionStart}
        onEditingInteractionEnd={handleEditingInteractionEnd}
      >
        <div
          className="relative h-full w-full"
          onClick={handleClickToEdit}
          onDoubleClick={handleDoubleClick}
          onBlur={handleBlur}
          role="presentation"
        >
          <div
            className={cn(
              "absolute inset-0 border shadow transition-colors",
              shape === "rectangle" && "rounded-lg",
            )}
            style={{
              backgroundColor: color.background,
              borderColor: color.border,
              ...shapeStyles,
            }}
          />
          <div
            ref={containerRef}
            className={cn("flex")}
            style={{ ...textContainerStyles, color: color.text }}
          >
            <div className="relative h-full w-full">
              {isTyping ? (
                <div
                  className="h-full w-full nodrag"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                >
                  <MinimalTiptap
                    editor={editor}
                    theme="transparent"
                    className={cn(
                      "h-full w-full leading-tight cursor-text nodrag",
                      "[&_.ProseMirror]:min-h-0",
                      "[&_.ProseMirror]:px-2",
                      "[&_.ProseMirror]:py-1.5",
                      "[&_.ProseMirror]:leading-[1.2]",
                      "[&_.ProseMirror]:flex [&_.ProseMirror]:flex-col [&_.ProseMirror]:justify-center",
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
                    "h-full flex flex-col justify-center",
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
                  "h-full flex flex-col justify-center",
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
