import React, { useCallback, useEffect, useRef } from "react";
import { marked } from "marked";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/utils/tailwind";
import { SingleLlmSelect } from "@/core/llm/SingleLlmSelect";
import type { AiModel } from "@/core/llm/aiModels";

import { useLinearHistory } from "./LinearHistoryContext";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

type LinearHistoryFormValues = {
  model: AiModel;
  prompt: string;
};

/**
 * A drawer component that displays the linear history of a node and allows the user to interact with an AI model.
 * It displays the history as a list of items, and provides a form to send a prompt to the AI.
 */
const LinearHistoryDrawer = () => {
  const { isOpen, items, close, activeNodeId, isCycleTruncated, sendPrompt } =
    useLinearHistory();
  const activeItemRef = useRef<HTMLDivElement | null>(null);
  const form = useForm<LinearHistoryFormValues>({
    defaultValues: {
      model: "deepseek",
      prompt: "",
    },
    mode: "onSubmit",
  });
  const {
    reset,
    watch,
    formState: { isSubmitting },
  } = form;
  const promptValue = watch("prompt");
  const isPromptEmpty = promptValue.trim().length === 0;

  // This effect scrolls the active history item into view when the drawer is opened.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    activeItemRef.current?.scrollIntoView({ block: "center" });
  }, [isOpen, activeNodeId]);

  // This function is called when the user submits the AI prompt form.
  const onSubmit = useCallback(
    async (values: LinearHistoryFormValues) => {
      const trimmedPrompt = values.prompt.trim();
      if (!trimmedPrompt) {
        return;
      }

      try {
        // Send the prompt to the AI model.
        await sendPrompt({ model: values.model, prompt: trimmedPrompt });
        // Reset the form after the prompt is sent.
        reset({ model: values.model, prompt: "" });
      } catch (error) {
        console.error("Workspace AI prompt failed", error);
        toast.error("Failed to generate AI response");
      }
    },
    [reset, sendPrompt],
  );

  return (
    <Drawer open={isOpen} onOpenChange={(open) => (!open ? close() : undefined)}>
      <DrawerContent
        side="right"
        showHandle={false}
        adjustable
        drawerId="linear-history"
        defaultSize={480}
        className="border-l bg-background p-0"
      >
        <div className="flex h-full flex-col">
          {/* Header with title and close button */}
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-left text-base font-semibold">
                Linear History
              </DrawerTitle>
              <DrawerClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close linear history"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </div>

          {/* List of history items */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Select a node to view its linear history.
              </p>
            ) : (
              <ol className="space-y-3">
                {items.map((item) => (
                  <li key={item.id}>
                    <div
                      ref={item.id === activeNodeId ? activeItemRef : undefined}
                      className={cn(
                        "rounded-lg border p-3 text-sm shadow-sm transition-colors",
                        item.id === activeNodeId
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background",
                      )}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {item.title}
                      </p>
                      {item.summary ? (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                          {item.summary}
                        </p>
                      ) : null}
                      {item.prompt ? (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Prompt
                          </p>
                          <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                            {item.prompt}
                          </p>
                        </div>
                      ) : null}
                      {item.response ? (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Response
                          </p>
                          <div
                            className="prose prose-sm max-w-none text-foreground"
                            dangerouslySetInnerHTML={{
                              __html: marked.parse(item.response ?? ""),
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {/* Show a message if the history is truncated due to a cycle. */}
            {isCycleTruncated ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Cycle detected. History stops at the first repeated node.
              </p>
            ) : null}
          </div>

          {/* AI prompt form */}
          <div className="border-t px-4 py-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                    <label
                    htmlFor="linear-history-composer"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                    Workspace AI
                    </label>
                    <div className={cn(isSubmitting && "pointer-events-none opacity-70")}>
                        <FormField
                            control={form.control}
                            name="model"
                            render={({ field }) => (
                            <FormItem className="space-y-1">
                                <FormLabel className="text-xs font-medium text-slate-600">
                                Model
                                </FormLabel>
                                <FormControl>
                                <SingleLlmSelect
                                    value={field.value}
                                    onChange={field.onChange}
                                />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <FormField
                        control={form.control}
                        name="prompt"
                        render={({ field }) => (
                            <FormItem className="flex h-full flex-col space-y-0">
                                <FormLabel className="text-xs font-medium text-slate-600">
                                Prompt
                                </FormLabel>
                                <FormControl className="mt-1 min-h-[120px] flex-1">
                                <textarea
                                    id="linear-history-composer"
                                    className="h-24 w-full resize-none rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3 text-sm text-foreground"
                                    placeholder="Ask the workspace AI to extend this path..."
                                    disabled={isSubmitting}
                                    {...field}
                                />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <Button
                    className="w-full"
                    type="submit"
                    disabled={isSubmitting || isPromptEmpty}
                >
                    {isSubmitting ? "Sending..." : "Send"}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default LinearHistoryDrawer;
