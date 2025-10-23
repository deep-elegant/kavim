import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DraftRecord } from "@/core/drafts/types";

/**
 * Formats a timestamp string for display in the UI.
 * - Returns localized datetime if parsable, otherwise returns the raw string.
 */
const formatTimestamp = (timestamp: string | null) => {
  if (!timestamp) {
    return "Unknown time";
  }

  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return timestamp;
  }

  return new Date(parsed).toLocaleString();
};

/**
 * Dialog shown at startup to recover unsaved drafts.
 * - Lists all available drafts with metadata (name, last updated, file path).
 * - User can resume a draft (loads it into canvas) or discard it permanently.
 * - `processingId` disables buttons while loading to prevent duplicate actions.
 */
type DraftRecoveryDialogProps = {
  isOpen: boolean;
  drafts: DraftRecord[];
  onResume: (draftId: string) => void;
  onDiscard: (draftId: string) => void;
  onClose: (options?: { dismissed?: boolean }) => void;
  processingId?: string | null;
};

export const DraftRecoveryDialog: React.FC<DraftRecoveryDialogProps> = ({
  isOpen,
  drafts,
  onResume,
  onDiscard,
  onClose,
  processingId,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Restore unsaved work</DialogTitle>
          <DialogDescription>
            We found unfinished projects saved as drafts. Choose a draft to
            resume or discard it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="border-border bg-muted/30 flex flex-col gap-2 rounded-md border p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {draft.projectName ?? "Untitled draft"}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    Updated {formatTimestamp(draft.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDiscard(draft.id)}
                    disabled={processingId === draft.id}
                  >
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onResume(draft.id)}
                    disabled={processingId === draft.id}
                  >
                    {processingId === draft.id ? "Loading…" : "Resume"}
                  </Button>
                </div>
              </div>
              {draft.filePath ? (
                <p className="text-muted-foreground truncate text-xs">
                  Last saved to {draft.filePath}
                </p>
              ) : null}
            </div>
          ))}
          {drafts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No drafts available.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onClose({ dismissed: true })}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
