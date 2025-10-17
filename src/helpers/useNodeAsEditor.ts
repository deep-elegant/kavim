import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useMemo, useRef, type MouseEvent, type FocusEvent } from 'react';
import { cn } from '@/utils/tailwind';
import {
  DEFAULT_FONT_SIZE,
  FontSize,
  type FontSizeMode,
  type FontSizeStorage,
} from './FontSize';
import { useCanvasData } from '@/core/canvas/CanvasDataContext';

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

export const useNodeAsEditor = <T extends NodeDataWithLabel>({ id, data }: UseNodeAsEditorParams<T>) => {
  const { setNodes } = useCanvasData();
  const isTyping = Boolean(data.isTyping);
  const label = data.label ?? '';
  const fontSizeMode = data.fontSizeMode ?? 'auto';
  const fontSizeValue = data.fontSizeValue ?? DEFAULT_FONT_SIZE;

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

  const updateNodeDataRef = useRef(updateNodeData);

  useEffect(() => {
    updateNodeDataRef.current = updateNodeData;
  }, [updateNodeData]);

  const handleLabelChange = (value: string) => {
    updateNodeData({ label: value } as Partial<T>);
  };

  const initialFontSizeMode = useRef<FontSizeMode>(fontSizeMode);
  const initialFontSizeValue = useRef<number>(fontSizeValue);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
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

  useEffect(() => {
    if (!data.fontSizeMode || typeof data.fontSizeValue !== 'number') {
      updateNodeData({
        fontSizeMode: fontSizeMode,
        fontSizeValue: fontSizeValue,
      } as Partial<T>);
    }
  }, [data.fontSizeMode, data.fontSizeValue, fontSizeMode, fontSizeValue, updateNodeData]);

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

  useEffect(() => {
    if (editor && label !== editor.getHTML()) {
      editor.commands.setContent(label, false);
    }
  }, [label, editor]);

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

  const setTypingState = (value: boolean) => {
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
  };

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!isTyping) {
      setTypingState(true);
    }
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget as HTMLElement | null;

    if (relatedTarget?.closest('[data-editor-toolbar]')) {
      return;
    }

    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    setTypingState(false);
  };

  return { editor, isTyping, handleDoubleClick, handleBlur, updateNodeData };
};
