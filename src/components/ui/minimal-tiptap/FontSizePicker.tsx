import React, { useEffect, useMemo, useState } from "react";
import { type Editor } from "@tiptap/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_FONT_SIZE,
  type FontSizeStorage,
} from "@/components/ui/minimal-tiptap/FontSizePlugin";

type PresetSize = { label: string; value: number | "auto" };

const FONT_SIZES: PresetSize[] = [
  { label: "Auto", value: "auto" },
  { label: "8", value: 8 },
  { label: "12", value: 12 },
  { label: "16", value: 16 },
  { label: "20", value: 20 },
  { label: "28", value: 28 },
  { label: "48", value: 48 },
  { label: "72", value: 72 },
];

const formatSize = (value: number) => Math.max(1, Math.round(value)).toString();

export const FontSizePicker = ({ editor }: { editor: Editor | null }) => {
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const storage = useMemo(() => {
    if (!editor) {
      return undefined;
    }

    return editor.storage.fontSize as FontSizeStorage | undefined;
  }, [editor]);

  const mode = storage?.mode ?? "auto";
  const manualSize = storage?.value ?? DEFAULT_FONT_SIZE;
  useEffect(() => {
    setDraftValue(null);
  }, [mode, manualSize]);

  if (!editor) {
    return null;
  }

  const displayValue =
    draftValue ?? (mode === "auto" ? "Auto" : formatSize(manualSize));

  const handleSizeSelect = (value: PresetSize["value"]) => {
    if (value === "auto") {
      editor.commands.setAutoFontSize();
    } else {
      editor.commands.setFontSize(value);
    }
    setDraftValue(null);
    setIsOpen(false);
  };

  const handleCustomSizeChange = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    const input = (draftValue ?? event.currentTarget.value).trim();
    const parsed = Number.parseFloat(input);
    if (Number.isFinite(parsed) && parsed > 0) {
      editor.commands.setFontSize(parsed);
      setDraftValue(null);
      setIsOpen(false);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDraftValue(event.target.value);
  };

  const handleInputFocus = () => {
    setDraftValue((current) => {
      if (current !== null) {
        return current;
      }

      return mode === "auto" ? "" : formatSize(manualSize);
    });
  };

  const handleInputBlur = () => {
    setDraftValue((current) => {
      if (current === null) {
        return current;
      }

      return current.trim().length === 0 ? null : current;
    });
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Input
          type="text"
          className="w-24 border-0 bg-transparent px-2 text-sm font-medium shadow-none focus:ring-0"
          value={displayValue}
          onChange={handleInputChange}
          onKeyDown={handleCustomSizeChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onClick={() => setIsOpen(true)}
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-28 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col">
          {FONT_SIZES.map((size) => {
            const isActive =
              size.value === "auto"
                ? mode === "auto"
                : mode === "fixed" && Math.round(manualSize) === size.value;

            return (
              <Button
                key={size.label}
                variant={isActive ? "secondary" : "ghost"}
                className="justify-start"
                onClick={() => handleSizeSelect(size.value)}
              >
                {size.value === "auto" ? "Auto" : size.label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
