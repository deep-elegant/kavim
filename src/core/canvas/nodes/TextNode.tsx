import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { type NodeProps, type Node } from "@xyflow/react";

import NodeInteractionOverlay from "./NodeInteractionOverlay";
import { type DrawableNode } from "./DrawableNode";
import { MinimalTiptap } from "@/components/ui/minimal-tiptap";
import { cn } from "@/utils/tailwind";
import {
  useClickToEditHandler,
  useNodeAsEditor,
} from "@/helpers/useNodeAsEditor";
import { type FontSizeSetting } from "@/components/ui/minimal-tiptap/FontSizePlugin";
import { useAutoFontSizeObserver } from "./useAutoFontSizeObserver";
import { useCanvasData } from "@/core/canvas/CanvasDataContext";
import { type Editor } from "@tiptap/react";

/** Data structure for text nodes with rich text editing capabilities */
export type TextNodeData = {
  label: string;
  isTyping?: boolean;
  fontSize?: FontSizeSetting;
};

export type TextNode = Node<TextNodeData, "text-node">;

const MIN_WIDTH = 200;
const MIN_HEIGHT = 32;
const PADDING_X = 12; // Matches px-3
const PADDING_Y = 4; // Matches py-1
const AUTO_FONT_MIN = 10;
const AUTO_FONT_RATIO = 0.8; // Conservative ratio to prevent jumping

/**
 * Implements DrawableNode interface for creating text nodes via drag interaction.
 * Nodes auto-enter typing mode after creation for immediate text input.
 */
export const textDrawable: DrawableNode<TextNode> = {
  onPaneMouseDown: (id, position) => ({
    id,
    type: "text-node",
    position,
    data: {
      label: "",
      isTyping: false,
      fontSize: "auto",
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
        isTyping: true, // Auto-activate typing mode for immediate editing
      },
    };
  },
};

/**
 * Renders a rich text node on the canvas.
 * - Supports markdown-style formatting (headings, lists, bold, etc.).
 * - Auto-scales font size to fit content when in 'auto' mode.
 * - Toggles between edit mode (TipTap editor) and display mode (rendered HTML).
 * - Double-click to enter edit mode.
 */
const TextNodeComponent = memo(
  ({ id, data, selected }: NodeProps<TextNode>) => {
    const { setNodes } = useCanvasData();

    const handleStopEditing = useCallback(
      (editor: Editor | null) => {
        if (editor && editor.isEmpty) {
          setNodes((nodes) => nodes.filter((node) => node.id !== id));
        }
      },
      [id, setNodes],
    );

    const {
      editor,
      isTyping,
      handleDoubleClick,
      handleBlur,
      fontSizeSetting,
      resolvedFontSize,
      setTypingState,
    } = useNodeAsEditor({ id, data, onStopEditing: handleStopEditing });
    const handleClickToEdit = useClickToEditHandler(
      selected,
      isTyping,
      setTypingState,
    );

    // Switch into typing mode from a key press and replace any existing content.
    const startTypingFromKey = useCallback(
      (initialText: string | null) => {
        setTypingState(true);

        requestAnimationFrame(() => {
          if (!editor) {
            return;
          }

          editor.commands.setContent("");
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

    const label = data.label ?? "";
    const containerRef = useRef<HTMLDivElement>(null);

    // Hidden measurement element for calculating optimal font size
    const measurementRef = useRef<HTMLDivElement>(null);

    const displayHtml = useMemo(
      () => label || "<p>Click to add text</p>",
      [label],
    );

    // Use a shorter placeholder for measurement during typing to prevent
    // the font size from collapsing due to the long "Click to add text" string.
    const measurementHtml = useMemo(() => {
      if (isTyping && !label) {
        return "<p>M</p>";
      }
      return displayHtml;
    }, [isTyping, label, displayHtml]);

    /**
     * Derives an upper bound for auto font sizing based on the current node geometry.
     * - Subtracts padding so the computed size reflects the actual drawable area.
     * - Scales proportionally to keep text legible across very small nodes.
     */
    const getAutoFontCap = useCallback(
      ({ width, height }: { width: number; height: number }) => {
        const usableWidth = Math.max(
          Math.min(width - PADDING_X * 2, width),
          AUTO_FONT_MIN,
        );
        const usableHeight = Math.max(
          Math.min(height - PADDING_Y * 2, height),
          AUTO_FONT_MIN,
        );
        const available = Math.min(usableWidth, usableHeight);
        const scaled = Math.floor(available * AUTO_FONT_RATIO);
        return Math.max(AUTO_FONT_MIN, scaled);
      },
      [],
    );

    // Dynamically adjust font size when in auto mode based on container dimensions
    useAutoFontSizeObserver({
      editor,
      fontSize: fontSizeSetting,
      html: measurementHtml,
      containerRef: containerRef as React.RefObject<HTMLElement>,
      measurementRef: measurementRef as React.RefObject<HTMLElement>,
      maxSize: getAutoFontCap,
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
          onClick={handleClickToEdit}
          onDoubleClick={handleDoubleClick}
          onBlur={handleBlur}
          role="presentation"
        >
          <div
            ref={containerRef}
            className="relative flex h-full w-full flex-col justify-center overflow-hidden"
          >
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
                    "[&_.ProseMirror]:flex [&_.ProseMirror]:flex-col [&_.ProseMirror]:justify-center",
                    "[&_.ProseMirror]:py-1",
                    "[&_.ProseMirror_p]:my-0",
                    "[&_.ProseMirror_ul]:my-0 [&_.ProseMirror_ol]:my-0",
                  )}
                  matchContainerHeight={true}
                  style={{ fontSize: `${resolvedFontSize}px` }}
                />
              </div>
            ) : (
              // Rendered view with prose styles for readable typography
              <div
                className={cn(
                  "prose prose-sm w-full max-w-none",
                  "h-full flex flex-col justify-center",
                  "prose-h1:text-xl prose-h1:leading-tight",
                  "prose-h2:text-lg prose-h2:leading-snug",
                  "prose-h3:text-base prose-h3:leading-snug",
                  "prose-p:my-0 prose-p:leading-tight",
                  "prose-ul:my-0 prose-ol:my-0",
                  "prose-li:my-0",
                  "px-3 py-1",
                  "text-slate-900",
                  "break-words",
                )}
                style={{ fontSize: `${resolvedFontSize}px` }}
                dangerouslySetInnerHTML={{ __html: displayHtml }}
              />
            )}

            {/* Hidden measurement element with identical styling for font size calculation */}
            <div
              ref={measurementRef}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 box-border overflow-hidden opacity-0",
                "prose prose-sm w-full max-w-none",
                "h-full flex flex-col justify-center",
                "prose-h1:text-xl prose-h1:leading-tight",
                "prose-h2:text-lg prose-h2:leading-snug",
                "prose-h3:text-base prose-h3:leading-snug",
                "prose-p:my-0 prose-p:leading-tight",
                "prose-ul:my-0 prose-ol:my-0",
                "prose-li:my-0",
                "px-3 py-1",
                "break-words",
              )}
              dangerouslySetInnerHTML={{ __html: measurementHtml }}
            />
          </div>
        </div>
      </NodeInteractionOverlay>
    );
  },
);

TextNodeComponent.displayName = "TextNode";

export default TextNodeComponent;
