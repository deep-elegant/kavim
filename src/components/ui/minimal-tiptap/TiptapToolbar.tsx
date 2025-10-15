import React, { type ReactNode } from 'react';
import { type Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FontSizePicker } from './FontSizePicker';

type ToolbarBaseItem = {
  id?: string;
  ariaLabel?: string;
};

export type ToolbarToggleItem = ToolbarBaseItem & {
  type: 'toggle';
  icon: LucideIcon;
  isActive: (editor: Editor) => boolean;
  onToggle: (editor: Editor) => void;
  isDisabled?: (editor: Editor) => boolean;
};

export type ToolbarButtonItem = ToolbarBaseItem & {
  type: 'button';
  icon: LucideIcon;
  onClick: (editor: Editor) => void;
  isDisabled?: (editor: Editor) => boolean;
};

export type ToolbarSeparatorItem = ToolbarBaseItem & {
  type: 'separator';
};

export type ToolbarCustomItem = ToolbarBaseItem & {
  type: 'custom';
  render: (editor: Editor | null) => ReactNode;
};

export type ToolbarItem =
  | ToolbarToggleItem
  | ToolbarButtonItem
  | ToolbarSeparatorItem
  | ToolbarCustomItem;

export interface TiptapToolbarProps {
  editor: Editor | null;
  items?: ToolbarItem[];
}

const defaultToolbarItems: ToolbarItem[] = [
  {
    type: 'custom',
    id: 'font-size-picker',
    render: (editor) => <FontSizePicker editor={editor} />,
  },
  { type: 'separator', id: 'separator-font-size' },
  {
    type: 'toggle',
    id: 'bold',
    icon: Bold,
    ariaLabel: 'Toggle bold',
    isActive: (editor) => editor.isActive('bold'),
    onToggle: (editor) => editor.chain().focus().toggleBold().run(),
    isDisabled: (editor) => !editor.can().chain().focus().toggleBold().run(),
  },
  {
    type: 'toggle',
    id: 'italic',
    icon: Italic,
    ariaLabel: 'Toggle italic',
    isActive: (editor) => editor.isActive('italic'),
    onToggle: (editor) => editor.chain().focus().toggleItalic().run(),
    isDisabled: (editor) => !editor.can().chain().focus().toggleItalic().run(),
  },
  {
    type: 'toggle',
    id: 'strike',
    icon: Strikethrough,
    ariaLabel: 'Toggle strike-through',
    isActive: (editor) => editor.isActive('strike'),
    onToggle: (editor) => editor.chain().focus().toggleStrike().run(),
    isDisabled: (editor) => !editor.can().chain().focus().toggleStrike().run(),
  },
  {
    type: 'toggle',
    id: 'code',
    icon: Code,
    ariaLabel: 'Toggle code',
    isActive: (editor) => editor.isActive('code'),
    onToggle: (editor) => editor.chain().focus().toggleCode().run(),
    isDisabled: (editor) => !editor.can().chain().focus().toggleCode().run(),
  },
  { type: 'separator', id: 'separator-formatting' },
  {
    type: 'toggle',
    id: 'heading-1',
    icon: Heading1,
    ariaLabel: 'Toggle heading level 1',
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
    onToggle: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    type: 'toggle',
    id: 'heading-2',
    icon: Heading2,
    ariaLabel: 'Toggle heading level 2',
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    onToggle: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    type: 'toggle',
    id: 'heading-3',
    icon: Heading3,
    ariaLabel: 'Toggle heading level 3',
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
    onToggle: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  { type: 'separator', id: 'separator-headings' },
  {
    type: 'toggle',
    id: 'bullet-list',
    icon: List,
    ariaLabel: 'Toggle bullet list',
    isActive: (editor) => editor.isActive('bulletList'),
    onToggle: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    type: 'toggle',
    id: 'ordered-list',
    icon: ListOrdered,
    ariaLabel: 'Toggle ordered list',
    isActive: (editor) => editor.isActive('orderedList'),
    onToggle: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    type: 'toggle',
    id: 'blockquote',
    icon: Quote,
    ariaLabel: 'Toggle blockquote',
    isActive: (editor) => editor.isActive('blockquote'),
    onToggle: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  { type: 'separator', id: 'separator-block' },
  {
    type: 'button',
    id: 'horizontal-rule',
    icon: Minus,
    ariaLabel: 'Insert horizontal rule',
    onClick: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  { type: 'separator', id: 'separator-history' },
  {
    type: 'button',
    id: 'undo',
    icon: Undo,
    ariaLabel: 'Undo',
    onClick: (editor) => editor.chain().focus().undo().run(),
    isDisabled: (editor) => !editor.can().chain().focus().undo().run(),
  },
  {
    type: 'button',
    id: 'redo',
    icon: Redo,
    ariaLabel: 'Redo',
    onClick: (editor) => editor.chain().focus().redo().run(),
    isDisabled: (editor) => !editor.can().chain().focus().redo().run(),
  },
];

const renderToolbarItem = (editor: Editor | null, item: ToolbarItem, index: number) => {
  const key = item.id ?? index;

  if (item.type === 'separator') {
    return <Separator key={key} orientation="vertical" className="h-6" />;
  }

  if (item.type === 'custom') {
    return (
      <div key={key} className="flex items-center" data-toolbar-custom>
        {item.render(editor)}
      </div>
    );
  }

  if (!editor) {
    return null;
  }

  if (item.type === 'button') {
    const Icon = item.icon;
    const disabled = item.isDisabled?.(editor) ?? false;

    return (
      <Button
        key={key}
        variant="ghost"
        size="sm"
        aria-label={item.ariaLabel}
        onClick={() => item.onClick(editor)}
        disabled={disabled}
      >
        <Icon className="h-4 w-4" />
      </Button>
    );
  }

  const Icon = item.icon;
  const pressed = item.isActive(editor);
  const disabled = item.isDisabled?.(editor) ?? false;

  return (
    <Toggle
      key={key}
      size="sm"
      pressed={pressed}
      aria-label={item.ariaLabel}
      onPressedChange={() => item.onToggle(editor)}
      disabled={disabled}
    >
      <Icon className="h-4 w-4" />
    </Toggle>
  );
};

export function TiptapToolbar({ editor, items = defaultToolbarItems }: TiptapToolbarProps) {
  return (
    <div className="flex items-center gap-1 rounded-md border bg-popover px-2 py-1 shadow-lg">
      {items.map((item, index) => renderToolbarItem(editor, item, index))}
    </div>
  );
}

export { defaultToolbarItems };
