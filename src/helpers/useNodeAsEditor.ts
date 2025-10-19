import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useMemo, useRef, type MouseEvent, type FocusEvent } from 'react';
import { cn } from '@/utils/tailwind';
import {
  DEFAULT_FONT_SIZE,
  FontSize,
  type FontSizeMode,
  type FontSizeStorage,
} from '../components/ui/minimal-tiptap/FontSizePlugin';
import { useCanvasData } from '@/core/canvas/CanvasDataContext';

/**
 * Base shape for node data that supports rich text editing.
 * - `label` holds the HTML content from TipTap editor.
 * - `isTyping` tracks whether this node is currently being edited.
 * - Font size properties enable per-node text scaling (auto or fixed).
 */
export type NodeDataWithLabel = {
  label: string;
  isTyping?: boolean;
  fontSizeMode?: FontSizeMode;
  fontSizeValue?: number;
};

export type UseNodeAsEditorParams<T extends NodeDataWithLabel> = {
  id: string;
  data: T;
};

/**
 * Hook to integrate a TipTap rich text editor into a canvas node.
 * - Manages editing state (typing vs. draggable).
 * - Syncs editor content bidirectionally with node data.
 * - Handles font size persistence (auto-scaling or fixed size).
 * - Prevents node dragging while typing by toggling `.nodrag` class.
 */
export const useNodeAsEditor = <T extends NodeDataWithLabel>({ id, data }: UseNodeAsEditorParams<T>) => {
  const { setNodes } = useCanvasData();
  const isTyping = Boolean(data.isTyping);
  const label = data.label ?? '';
  const fontSizeMode = data.fontSizeMode ?? 'auto';
  const fontSizeValue = data.fontSizeValue ?? DEFAULT_FONT_SIZE;

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
    [id, setNodes],
  );

  // Stable ref to avoid re-creating TipTap extensions when updateNodeData changes
  const updateNodeDataRef = useRef(updateNodeData);

  useEffect(() => {
    updateNodeDataRef.current = updateNodeData;
  }, [updateNodeData]);

  const handleLabelChange = (value: string) => {
    updateNodeData({ label: value } as Partial<T>);
  };

  // Freeze initial font settings to prevent re-initializing the editor on every render
  const initialFontSizeMode = useRef<FontSizeMode>(fontSizeMode);
  const initialFontSizeValue = useRef<number>(fontSizeValue);

  /** TipTap extensions: rich text features + custom font size plugin. */
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      // Custom extension to persist font size changes back to node data
      FontSize.configure({
        initialMode: initialFontSizeMode.current,
        initialValue: initialFontSizeValue.current,
        onChange: (mode, value) => {
          updateNodeDataRef.current({
            fontSizeMode: mode,
            fontSizeValue: value,
          } as Partial<T>);
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
          'prose prose-sm w-full max-w-none focus:outline-none',
          'prose-h1:text-xl prose-h1:leading-tight',
          'prose-h2:text-lg prose-h2:leading-snug',
          'prose-h3:text-base prose-h3:leading-snug',
          'prose-p:my-1 prose-p:leading-normal',
          'prose-ul:my-1 prose-ol:my-1',
          'prose-li:my-0',
          'min-h-[1.5rem] border-0 px-3 py-2',
        ),
      },
    },
  });

  // Initialize font size properties if missing (e.g., older saved nodes)
  useEffect(() => {
    if (!data.fontSizeMode || typeof data.fontSizeValue !== 'number') {
      updateNodeData({
        fontSizeMode: fontSizeMode,
        fontSizeValue: fontSizeValue,
      } as Partial<T>);
    }
  }, [data.fontSizeMode, data.fontSizeValue, fontSizeMode, fontSizeValue, updateNodeData]);

  // Sync font size from node data into TipTap editor when changed externally
  useEffect(() => {
    if (!editor) {
      return;
    }

    const storage = (editor.storage.fontSize ?? {}) as Partial<FontSizeStorage>;
    if (fontSizeMode === 'auto') {
      if (storage.mode !== 'auto') {
        editor.commands.setAutoFontSize();
      }
      if (typeof fontSizeValue === 'number') {
        editor.commands.updateAutoFontSize(fontSizeValue);
      }
    } else {
      if (storage.mode !== 'fixed' || storage.value !== fontSizeValue) {
        editor.commands.setFontSize(fontSizeValue);
      }
    }
  }, [editor, fontSizeMode, fontSizeValue]);

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
        editor.view.dom.classList.add('nodrag');
        editor.commands.focus('end');
      } else {
        editor.view.dom.classList.remove('nodrag');
      }
    }
  }, [isTyping, editor]);

  /**
   * Sets typing state for this node and clears it for all others.
   * - Ensures only one node is editable at a time.
   */
  const setTypingState = useCallback(
    (value: boolean) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...(node.data as NodeDataWithLabel),
                isTyping: value,
              },
            };
          }
          // Disable typing on all other nodes when entering edit mode
          if (value && node.data?.isTyping) {
            return {
              ...node,
              data: {
                ...(node.data as NodeDataWithLabel),
                isTyping: false,
              },
            };
          }
          return node;
        }),
      );
    },
    [id, setNodes],
  );

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
    if (relatedTarget?.closest('[data-editor-toolbar]')) {
      return;
    }

    // Keep editing if focus moved to a child element (e.g., nested input)
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    setTypingState(false);
  };

  return { editor, isTyping, handleDoubleClick, handleBlur, updateNodeData, setTypingState };
};
