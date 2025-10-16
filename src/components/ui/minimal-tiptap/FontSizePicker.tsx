import React, { useState, useEffect } from 'react';
import { type Editor } from '@tiptap/react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const FONT_SIZES = [
  { label: '8', value: '8px' },
  { label: '12', value: '12px' },
  { label: '16', value: '16px' },
  { label: '20', value: '20px' },
  { label: '28', value: '28px' },
  { label: '48', value: '48px' },
  { label: '72', value: '72px' },
];

export const FontSizePicker = ({ editor }: { editor: Editor | null }) => {
  if (!editor) return null;

  const getFontSize = () =>
    (editor.getAttributes('textStyle').fontSize || '14px').replace('px', '');

  const [value, setValue] = useState(getFontSize());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const updateValue = () => {
      setValue(getFontSize());
    };
    editor.on('transaction', updateValue);
    editor.on('selectionUpdate', updateValue);
    return () => {
      editor.off('transaction', updateValue);
      editor.off('selectionUpdate', updateValue);
    };
  }, [editor]);

  const handleSizeSelect = (size: string) => {
    if (size === '14px') {
      editor.chain().focus().unsetFontSize().run();
    } else {
      editor.chain().focus().setFontSize(size).run();
    }
    setValue(size.replace('px', ''));
    setIsOpen(false);
  };

  const handleCustomSizeChange = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLInputElement;
      const size = target.value;
      if (size && !isNaN(Number(size))) {
        editor.chain().focus().setFontSize(`${size}px`).run();
        setValue(size);
        setIsOpen(false);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Input
          type="number"
          className="w-20 border-0 bg-transparent px-2 text-sm font-medium shadow-none focus:ring-0"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleCustomSizeChange}
          onClick={() => setIsOpen(true)}
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-24 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col">
          {FONT_SIZES.map((size) => (
            <Button
              key={size.value}
              variant="ghost"
              className="justify-start"
              onClick={() => handleSizeSelect(size.value)}
            >
              {size.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
