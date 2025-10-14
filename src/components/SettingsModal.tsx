import React from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
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
  const [isDeepseekVisible, setIsDeepseekVisible] = React.useState(false);
  const [isChatgptVisible, setIsChatgptVisible] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setIsDeepseekVisible(false);
      setIsChatgptVisible(false);
    }
  }, [isOpen]);

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
              <div className="relative">
                <input
                  value={deepseekKey}
                  onChange={(event) => setDeepseekKey(event.target.value)}
                  type={isDeepseekVisible ? "text" : "password"}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Enter your DeepSeek key"
                />
                <button
                  type="button"
                  onClick={() => setIsDeepseekVisible((value) => !value)}
                  className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                  aria-label={isDeepseekVisible ? "Hide DeepSeek API key" : "Show DeepSeek API key"}
                >
                  {isDeepseekVisible ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              ChatGPT API Key
              <div className="relative">
                <input
                  value={chatgptKey}
                  onChange={(event) => setChatgptKey(event.target.value)}
                  type={isChatgptVisible ? "text" : "password"}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Enter your ChatGPT key"
                />
                <button
                  type="button"
                  onClick={() => setIsChatgptVisible((value) => !value)}
                  className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                  aria-label={isChatgptVisible ? "Hide ChatGPT API key" : "Show ChatGPT API key"}
                >
                  {isChatgptVisible ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            These API keys are stored locally using electron-store. Replace this storage approach when your secure backend is ready.
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
