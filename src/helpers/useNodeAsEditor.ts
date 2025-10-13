import { useReactFlow } from '@xyflow/react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, type MouseEvent, type FocusEvent } from 'react';
import { cn } from '@/utils/tailwind';

export type NodeDataWithLabel = {
  label: string;
  isTyping?: boolean;
};

export type UseNodeAsEditorParams<T extends NodeDataWithLabel> = {
  id: string;
  data: T;
};

export const useNodeAsEditor = <T extends NodeDataWithLabel>({ id, data }: UseNodeAsEditorParams<T>) => {
  const { setNodes } = useReactFlow();
  const isTyping = Boolean(data.isTyping);
  const label = data.label ?? '';

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

  const handleLabelChange = (value: string) => {
    updateNodeData({ label: value } as Partial<T>);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
    ],
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
