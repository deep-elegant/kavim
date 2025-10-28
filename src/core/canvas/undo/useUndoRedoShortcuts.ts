import { useEffect } from "react";

/** Options for the `useUndoRedoShortcuts` hook. */
type UndoRedoShortcutsOptions = {
  /** The function to call to perform an undo action. */
  undo: () => void;
  /** The function to call to perform a redo action. */
  redo: () => void;
  /** Whether the shortcuts are currently enabled. Defaults to true. */
  isEnabled?: boolean;
};

/**
 * Checks if the event target is an editable element, like an input or contenteditable div.
 * This prevents the global undo/redo shortcuts from interfering with text editing.
 */
const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  // Standard form elements
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  ) {
    return true;
  }

  // Check for any contenteditable parent
  return Boolean(target.closest("[contenteditable='true']"));
};

/**
 * A hook that binds global keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z)
 * to the provided `undo` and `redo` functions.
 */
export const useUndoRedoShortcuts = ({
  undo,
  redo,
  isEnabled = true,
}: UndoRedoShortcutsOptions) => {
  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      // Standard undo shortcut (Ctrl+Z or Cmd+Z)
      const isUndoShortcut =
        (event.metaKey || event.ctrlKey) && !event.shiftKey && key === "z";
      // Redo shortcuts (Ctrl+Y, Cmd+Y, Ctrl+Shift+Z, Cmd+Shift+Z)
      const isRedoShortcut =
        (event.metaKey || event.ctrlKey) &&
        ((event.shiftKey && key === "z") || (!event.shiftKey && key === "y"));

      if (!isUndoShortcut && !isRedoShortcut) {
        return;
      }

      // Don't interfere with native text editing undo/redo
      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();

      if (isUndoShortcut) {
        undo();
      } else {
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEnabled, redo, undo]);
};
