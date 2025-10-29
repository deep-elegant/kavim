import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/utils/tailwind";

import { useLinearHistory } from "./LinearHistoryContext";

const LinearHistoryDrawer = () => {
  const { isOpen, items, close, activeNodeId, isCycleTruncated } =
    useLinearHistory();
  const activeItemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    activeItemRef.current?.scrollIntoView({ block: "center" });
  }, [isOpen, activeNodeId]);

  return (
    <Drawer open={isOpen} onOpenChange={(open) => (!open ? close() : undefined)}>
      <DrawerContent
        side="right"
        showHandle={false}
        className="w-full max-w-md border-l bg-background p-0"
      >
        <div className="flex h-full flex-col">
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
                          <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                            {item.response}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {isCycleTruncated ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Cycle detected. History stops at the first repeated node.
              </p>
            ) : null}
          </div>

          <div className="border-t px-4 py-4">
            <div className="space-y-2">
              <label
                htmlFor="linear-history-composer"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Workspace AI (coming soon)
              </label>
              <textarea
                id="linear-history-composer"
                className="bg-muted/30 h-24 w-full resize-none rounded-md border border-dashed border-muted-foreground/40 p-3 text-sm text-muted-foreground"
                placeholder="Ask the workspace AI to extend this path..."
                disabled
              />
              <Button className="w-full" disabled>
                Send
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default LinearHistoryDrawer;

