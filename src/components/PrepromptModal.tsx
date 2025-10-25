import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PrepromptModalProps {
  isOpen: boolean;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  statusMessage?: string;
  statusTone?: "default" | "success" | "error";
}

export const PrepromptModal: React.FC<PrepromptModalProps> = ({
  isOpen,
  value,
  onChange,
  onCancel,
  onSave,
  statusMessage,
  statusTone = "default",
}) => {
  const statusClassName =
    statusTone === "error"
      ? "text-destructive"
      : statusTone === "success"
        ? "text-emerald-600"
        : "text-muted-foreground";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conversation preprompt</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <label className="flex flex-col gap-1 text-sm">
            Preprompt
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="border-input bg-background focus:ring-ring min-h-[140px] w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
              placeholder="Enter optional system instructions"
            />
          </label>
          <p className="text-muted-foreground text-xs">
            This text is sent as a system message before each conversation.
          </p>
          {statusMessage ? (
            <p className={`${statusClassName} text-sm`}>{statusMessage}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
