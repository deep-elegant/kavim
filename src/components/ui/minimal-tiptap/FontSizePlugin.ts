import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

export type FontSizeSource = "auto" | "user";

export interface FontSizeStorage {
  value: number;
  source: FontSizeSource;
  version: number;
}

export interface FontSizeChange {
  value: number;
  source: FontSizeSource;
  previousValue: number;
}

export interface FontSizeOptions {
  initialValue?: number;
  onChange?: (change: FontSizeChange) => void;
}

export const DEFAULT_FONT_SIZE = 14;

const clampFontSize = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_FONT_SIZE;
  }
  return Math.max(1, Math.round(value));
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: number, source?: FontSizeSource) => ReturnType;
    };
  }
}

const applySizeToEditor = (editor: Editor, size: number) => {
  editor.view.dom.style.fontSize = `${size}px`;
};

export const FontSize = Extension.create<FontSizeOptions>({
  name: "fontSize",

  addOptions() {
    return {
      initialValue: DEFAULT_FONT_SIZE,
      onChange: undefined,
    } satisfies FontSizeOptions;
  },

  addStorage() {
    const value = clampFontSize(this.options.initialValue ?? DEFAULT_FONT_SIZE);

    const storage: FontSizeStorage = {
      value,
      source: "user",
      version: 0,
    };

    return storage;
  },

  onCreate({ editor }) {
    const storage = this.storage as FontSizeStorage;
    applySizeToEditor(editor, storage.value);
  },

  addCommands() {
    return {
      setFontSize:
        (size: number, source: FontSizeSource = "user") =>
        ({ editor }) => {
          const normalized = clampFontSize(size);
          const storage = this.storage as FontSizeStorage;
          const previousValue = storage.value;

          if (previousValue === normalized) {
            return true;
          }

          storage.value = normalized;
          storage.source = source;
          storage.version += 1;

          applySizeToEditor(editor, normalized);

          this.options.onChange?.({
            value: normalized,
            source,
            previousValue,
          });

          return true;
        },
    };
  },
});
