import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { cn } from "@/utils/tailwind";
import {
  DEFAULT_FONT_SIZE,
  FontSize,
  type FontSizeChange,
  type FontSizeSetting,
  type FontSizeStorage,
} from "../components/ui/minimal-tiptap/FontSizePlugin";
import { useCanvasData } from "@/core/canvas/CanvasDataContext";
import { useCanvasUndoRedo } from "@/core/canvas/undo";

/**
 * Base shape for node data that supports rich text editing.
 * - `label` holds the HTML content from TipTap editor.
 * - `isTyping` tracks whether this node is currently being edited.
 * - Font size properties enable per-node text scaling (auto or fixed).
 */
export type NodeDataWithLabel = {
  label: string;
  isTyping?: boolean;
  fontSize?: FontSizeSetting;
};

export type UseNodeAsEditorParams<T extends NodeDataWithLabel> = {
  id: string;
  data: T;
  onStopEditing?: (editor: Editor | null) => void;
};

/**
 * Hook to integrate a TipTap rich text editor into a canvas node.
 * - Manages editing state (typing vs. draggable).
 * - Syncs editor content bidirectionally with node data.
 * - Handles font size persistence (auto-scaling or fixed size).
 * - Prevents node dragging while typing by toggling `.nodrag` class.
 */
export const useNodeAsEditor = <T extends NodeDataWithLabel>({
  id,
  data,
  onStopEditing,
}: UseNodeAsEditorParams<T>) => {
  const { setNodes } = useCanvasData();
  const { beginAction, commitAction, isReplaying } = useCanvasUndoRedo();
  const isTyping = Boolean(data.isTyping);
  const label = data.label ?? "";
  const fontSizeSetting = data.fontSize ?? "auto";
  // A ref to hold the token for the current typing session.
  const typingHistoryTokenRef = useRef<symbol | null>(null);

  /** Merges partial updates into this node's data object. */
  const updateNodeData = useCallback(
    (partial: Partial<T>) => {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...(node.data as T),
                  ...partial,
                },
              }
            : node,
        ),
      );
    },
    [beginAction, id, isReplaying, setNodes],
  );

  // Stable ref to avoid re-creating TipTap extensions when updateNodeData changes
  const updateNodeDataRef = useRef(updateNodeData);
  const initialFontSizeSetting = useRef<FontSizeSetting>(fontSizeSetting);
  const initialFontSizeValue = useRef<number>(
    typeof initialFontSizeSetting.current === "number"
      ? initialFontSizeSetting.current
      : DEFAULT_FONT_SIZE,
  );
  const [autoFontSize, setAutoFontSize] = useState<number>(
    typeof initialFontSizeSetting.current === "number"
      ? initialFontSizeSetting.current
      : initialFontSizeValue.current,
  );
  const fontSizeSettingRef = useRef<FontSizeSetting>(fontSizeSetting);

  useEffect(() => {
    updateNodeDataRef.current = updateNodeData;
  }, [updateNodeData]);

  const handleLabelChange = (value: string) => {
    updateNodeData({ label: value } as Partial<T>);
  };

  // Freeze initial font settings to prevent re-initializing the editor on every render
  /** TipTap extensions: rich text features + custom font size plugin. */
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      // Custom extension to persist font size changes back to node data
      FontSize.configure({
        initialMode:
          typeof initialFontSizeSetting.current === "number" ? "fixed" : "auto",
        initialValue: initialFontSizeValue.current,
        onChange: ({ mode, value, computed }: FontSizeChange) => {
          setAutoFontSize(computed);

          const nextSetting: FontSizeSetting = mode === "auto" ? "auto" : value;
          const previousSetting = fontSizeSettingRef.current;

          const settingsEqual =
            (previousSetting === "auto" && nextSetting === "auto") ||
            (typeof previousSetting === "number" &&
              typeof nextSetting === "number" &&
              previousSetting === nextSetting);

          if (settingsEqual) {
            return;
          }

          fontSizeSettingRef.current = nextSetting;
          updateNodeDataRef.current({ fontSize: nextSetting } as Partial<T>);
        },
      }),
    ],
    [],
  );

  /** Initialize TipTap editor with prose styling and update callbacks. */
  const editor = useEditor({
    extensions,
    content: label,
    onUpdate: ({ editor: updatedEditor }) => {
      handleLabelChange(updatedEditor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm w-full max-w-none focus:outline-none leading-tight",
          "prose-h1:text-xl prose-h1:leading-tight",
          "prose-h2:text-lg prose-h2:leading-snug",
          "prose-h3:text-base prose-h3:leading-snug",
          "prose-p:my-1 prose-p:leading-tight",
          "prose-ul:my-1 prose-ol:my-1",
          "prose-li:my-0",
          "min-h-[1.5rem] border-0 px-3 py-2",
        ),
      },
    },
  });

  useEffect(() => {
    fontSizeSettingRef.current = fontSizeSetting;
  }, [fontSizeSetting]);

  useEffect(() => {
    if (typeof fontSizeSetting !== "number") {
      return;
    }

    setAutoFontSize((current) =>
      current === fontSizeSetting ? current : fontSizeSetting,
    );
  }, [fontSizeSetting]);

  // Sync font size from node data into TipTap editor when changed externally
  useEffect(() => {
    if (!editor) {
      return;
    }

    const storage = (editor.storage.fontSize ?? {}) as Partial<FontSizeStorage>;
    if (fontSizeSetting === "auto") {
      if (storage.mode !== "auto") {
        editor.commands.setAutoFontSize();
      }
      return;
    }

    if (storage.mode !== "fixed" || storage.value !== fontSizeSetting) {
      editor.commands.setFontSize(fontSizeSetting);
    }
  }, [editor, fontSizeSetting]);

  // Sync label content into editor when changed externally (e.g., undo/redo, collaboration)
  useEffect(() => {
    if (editor && label !== editor.getHTML()) {
      editor.commands.setContent(label, false);
    }
  }, [label, editor]);

  // Toggle editor editability and `.nodrag` class based on typing state
  useEffect(() => {
    if (editor) {
      editor.setEditable(isTyping);
      if (isTyping) {
        editor.view.dom.classList.add("nodrag");
        editor.commands.focus("end");
      } else {
        editor.view.dom.classList.remove("nodrag");
      }
    }
  }, [isTyping, editor]);

  /**
   * Sets typing state for this node and clears it for all others.
   * - Ensures only one node is editable at a time.
   */
  const setTypingState = useCallback(
    (value: boolean) => {
      // When starting to type, begin a new undoable action.
      if (value && !typingHistoryTokenRef.current && !isReplaying) {
        const token = beginAction("node-edit");
        if (token) {
          typingHistoryTokenRef.current = token;
        }
      }

      setNodes((nodes) =>
        nodes.map((node) => {
          // Set typing state for this node, the rest of the nodes will be set by the onBlur event, so we don't need to do it here
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...(node.data as NodeDataWithLabel),
                isTyping: value,
              },
            };
          }
          return node;
        }),
      );
    },
    [beginAction, id, isReplaying, setNodes],
  );

  // When the user stops typing, commit the action to the undo stack.
  useEffect(() => {
    if (isTyping) {
      return;
    }

    const token = typingHistoryTokenRef.current;
    if (!token) {
      return;
    }

    typingHistoryTokenRef.current = null;
    commitAction(token);
  }, [commitAction, isTyping]);

  /** Enter edit mode on double-click. */
  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!isTyping) {
      setTypingState(true);
    }
  };

  /**
   * Exit edit mode on blur, unless focus moved to the toolbar or within the editor.
   * - Prevents accidental exit when clicking formatting buttons.
   */
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget as HTMLElement | null;

    // Keep editing if focus moved to the formatting toolbar
    if (relatedTarget?.closest("[data-editor-toolbar]")) {
      return;
    }

    // Keep editing if focus moved to a child element (e.g., nested input)
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    setTypingState(false);
    onStopEditing?.(editor);
  };

  const resolvedFontSize =
    fontSizeSetting === "auto" ? autoFontSize : fontSizeSetting;

  return {
    editor,
    isTyping,
    handleDoubleClick,
    handleBlur,
    updateNodeData,
    setTypingState,
    fontSizeSetting,
    resolvedFontSize,
  };
};
