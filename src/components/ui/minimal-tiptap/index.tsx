"use client";

import { type CSSProperties } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { cn } from "@/utils/tailwind";

interface MinimalTiptapProps {
  editor: Editor | null;
  placeholder?: string;
  className?: string;
  theme?: "default" | "readonly" | "disabled" | "transparent";
  style?: CSSProperties;
  /**
   * When true (default), the editor stretches to match the container height.
   */
  matchContainerHeight?: boolean;
}

function MinimalTiptap({
  editor,
  placeholder = "Start typing...",
  className,
  theme = "default",
  style,
  matchContainerHeight = true,
}: MinimalTiptapProps) {
  if (!editor) {
    return null;
  }

  return (
    <div className={cn("relative", className)} style={style}>
      <div
        className={cn(
          "relative h-full",
          matchContainerHeight && "min-h-[inherit]",
          theme === "default" &&
            "bg-background focus-within:border-primary rounded-lg border transition",
          theme === "disabled" &&
            "bg-muted cursor-not-allowed rounded-lg border opacity-50",
          theme === "transparent" &&
            "focus-within:border-primary bg-transparent transition",
        )}
      >
        <EditorContent
          editor={editor}
          placeholder={placeholder}
          className={cn(
            "w-full",
            matchContainerHeight
              ? "h-full min-h-[inherit] [&_.ProseMirror]:h-full [&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none [&_.ProseMirror:focus]:outline-none [&_.ProseMirror:focus]:ring-0 [&_.ProseMirror:focus]:shadow-none [&_.ProseMirror:focus]:border-transparent"
              : undefined,
          )}
        />
      </div>
    </div>
  );
}

export { MinimalTiptap, type MinimalTiptapProps };
