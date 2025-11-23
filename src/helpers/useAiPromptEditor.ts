import { useEditor, type EditorOptions } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import Placeholder from "@tiptap/extension-placeholder";
import HardBreak from "@tiptap/extension-hard-break";

type UseAiPromptEditorParams = {
  nodeId: string;
  content: string;
  placeholder?: string;
  disabled?: boolean;
  onContentChange: (html: string, plainText: string) => void;
  onSubmit?: () => void;
};

/**
 * Stable TipTap editor tailored for AI nodes.
 * - Keeps a single editor instance per node (prevents focus loss on re-render)
 * - Syncs node data whenever the prompt changes
 * - Restores text selection when collaborative updates replace the content
 */
export function useAiPromptEditor({
  nodeId,
  content,
  placeholder = "Ask or paste a prompt.",
  disabled = false,
  onContentChange,
  onSubmit,
}: UseAiPromptEditorParams) {
  const onChangeRef = useRef(onContentChange);
  const onSubmitRef = useRef(onSubmit);

  useEffect(() => {
    onChangeRef.current = onContentChange;
  }, [onContentChange]);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const extensions = useMemo(() => {
    return [
      Document,
      Paragraph,
      Text,
      History,
      HardBreak,
      Placeholder.configure({
        placeholder,
      }),
    ];
  }, [placeholder]);

  const editor = useEditor(
    {
      extensions,
      content,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        onChangeRef.current(html, editor.getText());
      },
      editorProps: {
        attributes: {
          class: "nodrag cursor-text",
        },
        handleDOMEvents: {
          mousedown: (_view, event) => {
            event.stopPropagation();
            return false;
          },
          pointerdown: (_view, event) => {
            event.stopPropagation();
            return false;
          },
        },
        handleKeyDown: (_view, event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmitRef.current?.();
            return true;
          }
          return false;
        },
      },
    } satisfies EditorOptions,
    [nodeId, extensions],
  );

  // Keep editor content in sync with external updates (e.g., collaboration, undo/redo)
  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentHtml = editor.getHTML();
    if (content === currentHtml) {
      return;
    }

    const { from, to } = editor.state.selection;
    const wasFocused = editor.isFocused;
    editor.commands.setContent(content, false);

    if (wasFocused) {
      const clampedFrom = Math.min(from, editor.state.doc.content.size);
      const clampedTo = Math.min(to, editor.state.doc.content.size);
      editor.commands.setTextSelection({
        from: clampedFrom,
        to: clampedTo,
      });
    }
  }, [content, editor]);

  // Toggle editability when requests are running (mirrors Textarea disabled prop)
  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return editor;
}
