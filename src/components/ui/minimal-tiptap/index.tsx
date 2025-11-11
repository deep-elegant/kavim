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
   * Disable this for text nodes so the caret height follows the actual line height.
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
            matchContainerHeight ? "h-full min-h-full" : undefined,
          )}
        />
      </div>
    </div>
  );
}

export { MinimalTiptap, type MinimalTiptapProps };
