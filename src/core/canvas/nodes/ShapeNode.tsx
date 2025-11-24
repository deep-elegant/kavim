import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { type NodeProps, type Node, useReactFlow } from "@xyflow/react";
import { type Editor } from "@tiptap/react";

import { cn } from "@/utils/tailwind";

import NodeInteractionOverlay from "./NodeInteractionOverlay";
import { type DrawableNode } from "./DrawableNode";
import {
  useClickToEditHandler,
  useNodeAsEditor,
  useEditorFocusAtClick,
} from "@/helpers/useNodeAsEditor";
import { MinimalTiptap } from "@/components/ui/minimal-tiptap";
import {
  defaultToolbarItems,
  type ToolbarItem,
} from "@/components/ui/minimal-tiptap/TiptapToolbar";
import {
  SimpleColorPicker,
  type ColorStyle,
} from "@/components/ui/simple-color-picker";
import { type FontSizeSetting } from "@/components/ui/minimal-tiptap/FontSizePlugin";
import { useTextNodeSizing } from "./useTextNodeSizing";
import { useCanvasUndoRedo } from "../undo";

export type ShapeType = "circle" | "rectangle";

/** Data structure for shape nodes with customizable colors and text */
export type ShapeNodeData = {
  label: string;
  shapeType: ShapeType;
  isTyping?: boolean;
  color?: ColorStyle;
  fontSize?: FontSizeSetting;
};

export type ShapeNode = Node<ShapeNodeData, "shape-node">;

export const CIRCLE_MIN_SIZE = 80;
export const RECTANGLE_MIN_WIDTH = 120;
export const RECTANGLE_MIN_HEIGHT = 60;

/** Default light blue theme for shape nodes */
const defaultColor: ColorStyle = {
  background: "#EFF6FF", // blue-50
  border: "#93C5FD", // blue-300
  text: "#1E293B", // slate-900
};

/**
 * Implements DrawableNode interface for creating shape nodes via drag interaction.
 * Creates square shapes by using the larger of width/height during drag (circles require 1:1 ratio).
 */
export const shapeDrawable: DrawableNode<ShapeNode> = {
  onPaneMouseDown: (id, position) => ({
    id,
    type: "shape-node",
    position,
    data: {
      label: "",
      shapeType: "circle",
      isTyping: false,
      color: defaultColor,
      fontSize: "auto",
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
    const size = Math.max(
      Number(node.style?.width ?? node.width ?? 0),
      CIRCLE_MIN_SIZE,
    );

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
const ShapeNodeComponent = memo(
  ({ id, data, selected }: NodeProps<ShapeNode>) => {
    const { setNodes } = useReactFlow();
    const { handleStartEditing, handleFocus } = useEditorFocusAtClick();

    const handleFontSizeChange = useCallback(
      (newSize: number, previousSize: number) => {
        setNodes((nodes) =>
          nodes.map((node) => {
            if (node.id !== id) return node;

            const shapeType = (node.data as ShapeNodeData).shapeType;
            const minWidth =
              shapeType === "circle" ? CIRCLE_MIN_SIZE : RECTANGLE_MIN_WIDTH;
            const minHeight =
              shapeType === "circle" ? CIRCLE_MIN_SIZE : RECTANGLE_MIN_HEIGHT;

            const ratio = newSize / previousSize;
            const width = Math.max(
              minWidth,
              (Number(node.width) || minWidth) * ratio,
            );
            const height = Math.max(
              minHeight,
              (Number(node.height) || minHeight) * ratio,
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
            };
          }),
        );
      },
      [id, setNodes],
    );

    const {
      editor,
      isTyping,
      handleDoubleClick,
      handleBlur: handleEditorBlur,
      updateNodeData,
      setTypingState,
      fontSizeSetting,
    } = useNodeAsEditor({
      id,
      data,
      onFocus: handleFocus,
      onFontSizeChange: handleFontSizeChange,
    });
    // Get the `performAction` function to wrap mutations in undoable actions.
    const { performAction } = useCanvasUndoRedo();
    const { label = "", shapeType } = data;
    const color = data.color ?? defaultColor;
    const containerRef = useRef<HTMLDivElement>(null);

    // Hidden measurement element for calculating optimal font size
    const measurementRef = useRef<HTMLDivElement>(null);
    // Tracks temporary blur events triggered by drag/resize interactions while editing.
    const editingInteractionGuardRef = useRef(false);

    // Clear the blur guard whenever we leave typing mode.
    useEffect(() => {
      if (!isTyping) {
        editingInteractionGuardRef.current = false;
      }
    }, [isTyping]);

    // Exit typing when the shape is deselected so Delete removes the node.
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

    // Mark the shape as "temporarily leaving focus" for drag/resize operations.
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

          editor.commands.setContent("", { emitUpdate: true });
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

    // Dynamically adjust font size when in auto mode based on shape dimensions
    useTextNodeSizing({
      editor,
      html: displayHtml,
      containerRef: containerRef as React.RefObject<HTMLElement>,
      measurementRef: measurementRef as React.RefObject<HTMLElement>,
    });

    const handleColorChange = useCallback(
      (value: ColorStyle) => {
        // Wrap the color change in `performAction` to make it undoable.
        performAction(() => {
          updateNodeData({ color: value });
        }, "shape-color");
      },
      [performAction, updateNodeData],
    );

    // Add color picker to the standard toolbar for per-node color customization
    const toolbarItems = useMemo<ToolbarItem[]>(
      () => [
        ...defaultToolbarItems,
        { type: "separator", id: "shape-node-color-separator" },
        {
          type: "custom",
          id: "shape-node-color-picker",
          render: () => (
            <SimpleColorPicker color={color} setColor={handleColorChange} />
          ),
        },
      ],
      [color, handleColorChange],
    );

    // Use shape-specific minimum dimensions and text alignment
    const minWidth =
      shapeType === "circle" ? CIRCLE_MIN_SIZE : RECTANGLE_MIN_WIDTH;
    const minHeight =
      shapeType === "circle" ? CIRCLE_MIN_SIZE : RECTANGLE_MIN_HEIGHT;
    const textAlignClass = shapeType === "circle" ? "text-center" : "text-left";

    const handleClickToEdit = useClickToEditHandler(
      selected,
      isTyping,
      setTypingState,
      handleStartEditing,
    );

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
        onEditingInteractionStart={handleEditingInteractionStart}
        onEditingInteractionEnd={handleEditingInteractionEnd}
      >
        <div
          className={cn(
            "relative flex h-full w-full overflow-hidden border text-slate-900 shadow-sm transition-colors",
            shapeType === "circle" ? "rounded-full" : "rounded-lg",
          )}
          style={{
            backgroundColor: color.background,
            borderColor: color.border,
          }}
          onDoubleClick={handleDoubleClick}
          onBlur={handleBlur}
          role="presentation"
          onClick={handleClickToEdit}
        >
          <div
            className={cn("flex h-full w-full")}
            style={{ color: color.text }}
          >
            <div ref={containerRef} className="relative h-full w-full">
              {isTyping ? (
                // Stop propagation to prevent node dragging while editing
                <div
                  className="h-full w-full nodrag"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                >
                  <MinimalTiptap
                    editor={editor}
                    theme="transparent"
                    className={cn(
                      "h-full w-full cursor-text nodrag",
                      textAlignClass,
                    )}
                    style={{
                      color: color.text,
                      fontSize: `${fontSizeSetting}px`,
                    }}
                  />
                </div>
              ) : (
                // Display mode with custom prose colors matching the shape's color scheme
                <div
                  className={cn(
                    "prose prose-sm flex h-full w-full max-w-none items-center justify-center overflow-hidden p-4 break-words whitespace-pre-wrap",
                    textAlignClass,
                  )}
                  style={
                    {
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
                      fontSize: `${fontSizeSetting}px`,
                    } as React.CSSProperties
                  }
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
                  "pointer-events-none absolute inset-0 box-border overflow-hidden opacity-0",
                  "prose prose-sm flex h-full w-full max-w-none items-center justify-center overflow-hidden p-4 break-words whitespace-pre-wrap",
                  textAlignClass,
                )}
                style={
                  {
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
                  } as React.CSSProperties
                }
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

ShapeNodeComponent.displayName = "ShapeNode";

export default ShapeNodeComponent;
