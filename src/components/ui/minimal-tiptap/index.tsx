'use client';

import { type CSSProperties } from 'react';
import {
  EditorContent,
  type Editor,
} from '@tiptap/react';
import { cn } from '@/utils/tailwind';


interface MinimalTiptapProps {
  editor: Editor | null;
  placeholder?: string;
  className?: string;
  theme?: 'default' | 'readonly' | 'disabled' | 'transparent';
  style?: CSSProperties;
}

function MinimalTiptap({
  editor,
  placeholder = 'Start typing...',
  className,
  theme = 'default',
  style,
}: MinimalTiptapProps) {

  if (!editor) {
    return null;
  }

  return (
    <div className={cn('relative', className)} style={style}>
      <div
        className={cn(
          'relative h-full',
          theme === 'default' &&
            'rounded-lg border bg-background transition focus-within:border-primary',
          theme === 'disabled' && 'cursor-not-allowed rounded-lg border bg-muted opacity-50',
          theme === 'transparent' && 'bg-transparent transition focus-within:border-primary ',

        )}
      >
        <EditorContent
          editor={editor}
          placeholder={placeholder}
          className="h-full min-h-full w-full"
        />
      </div>
    </div>
  );
}

export { MinimalTiptap, type MinimalTiptapProps };
