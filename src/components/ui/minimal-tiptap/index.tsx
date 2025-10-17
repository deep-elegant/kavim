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
          'relative',
          theme === 'default' && 'rounded-lg border bg-background transition focus-within:border-primary',
          theme === 'disabled' && 'rounded-lg border bg-muted opacity-50 cursor-not-allowed',
          theme === 'transparent' && 'bg-transparent transition focus-within:border-primary ',

        )}
      >
        <EditorContent editor={editor} placeholder={placeholder} />
      </div>
    </div>
  );
}

export { MinimalTiptap, type MinimalTiptapProps };
