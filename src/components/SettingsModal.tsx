import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deepseekKey: string;
  setDeepseekKey: (value: string) => void;
  chatgptKey: string;
  setChatgptKey: (value: string) => void;
  handleSettingsSave: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  deepseekKey,
  setDeepseekKey,
  chatgptKey,
  setChatgptKey,
  handleSettingsSave,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>LLM Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="flex flex-col gap-1 text-sm">
              DeepSeek API Key
              <input
                value={deepseekKey}
                onChange={(event) => setDeepseekKey(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Enter your DeepSeek key"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              ChatGPT API Key
              <input
                value={chatgptKey}
                onChange={(event) => setChatgptKey(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Enter your ChatGPT key"
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            These values are stored locally for now. Connect this menu to your secure storage solution when backend support is available.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSettingsSave}>Save settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
