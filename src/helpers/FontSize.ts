import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';

export type FontSizeMode = 'auto' | 'fixed';

export interface FontSizeStorage {
  mode: FontSizeMode;
  value: number;
  computed: number;
  version: number;
}

export interface FontSizeOptions {
  initialMode?: FontSizeMode;
  initialValue?: number;
  onChange?: (mode: FontSizeMode, value: number) => void;
}

export const DEFAULT_FONT_SIZE = 14;

const clampFontSize = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_FONT_SIZE;
  }

  return Math.max(1, Math.round(value));
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: number) => ReturnType;
      setAutoFontSize: () => ReturnType;
      updateAutoFontSize: (size: number) => ReturnType;
    };
  }
}

const applySizeToEditor = (editor: Editor, size: number) => {
  editor.view.dom.style.fontSize = `${size}px`;
};

export const FontSize = Extension.create<FontSizeOptions>({
  name: 'fontSize',

  addOptions() {
    return {
      initialMode: 'auto',
      initialValue: DEFAULT_FONT_SIZE,
      onChange: undefined,
    } satisfies FontSizeOptions;
  },

  addStorage() {
    const mode = this.options.initialMode ?? 'auto';
    const value = clampFontSize(this.options.initialValue ?? DEFAULT_FONT_SIZE);

    const storage: FontSizeStorage = {
      mode,
      value,
      computed: value,
      version: 0,
    };

    return storage;
  },

  onCreate({ editor }) {
    const storage = this.storage as FontSizeStorage;
    const initialSize = storage.mode === 'auto' ? storage.computed : storage.value;
    applySizeToEditor(editor, initialSize);
  },

  addCommands() {
    return {
      setFontSize:
        (size: number) =>
        ({ editor }) => {
          const normalized = clampFontSize(size);
          const storage = this.storage as FontSizeStorage;
          const previousMode = storage.mode;
          const previousValue = storage.value;

          storage.mode = 'fixed';
          storage.value = normalized;
          storage.computed = normalized;

          applySizeToEditor(editor, normalized);

          if (previousMode !== storage.mode || previousValue !== normalized) {
            storage.version += 1;
            this.options.onChange?.('fixed', normalized);
          }

          return true;
        },

      setAutoFontSize:
        () =>
        ({ editor }) => {
          const storage = this.storage as FontSizeStorage;
          const previousMode = storage.mode;
          storage.mode = 'auto';

          applySizeToEditor(editor, storage.computed ?? storage.value);

          if (previousMode !== storage.mode) {
            storage.version += 1;
            this.options.onChange?.('auto', storage.computed ?? storage.value);
          }

          return true;
        },

      updateAutoFontSize:
        (size: number) =>
        ({ editor }) => {
          const storage = this.storage as FontSizeStorage;
          const normalized = clampFontSize(size);
          const previousComputed = storage.computed;
          storage.computed = normalized;

          if (storage.mode === 'auto') {
            if (previousComputed !== normalized) {
              storage.version += 1;
              applySizeToEditor(editor, normalized);
              this.options.onChange?.('auto', normalized);
            } else {
              applySizeToEditor(editor, normalized);
            }
          }

          return true;
        },
    };
  },
});
