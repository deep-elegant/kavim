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
import { AI_PROVIDER_METADATA, type AiProvider } from "@/core/llm/aiModels";

type ProviderKeyMap = Record<AiProvider, string>;

type ProviderVisibilityMap = Record<AiProvider, boolean>;

const createInitialVisibilityMap = (): ProviderVisibilityMap =>
  AI_PROVIDER_METADATA.reduce((accumulator, provider) => {
    accumulator[provider.value] = false;
    return accumulator;
  }, {} as ProviderVisibilityMap);

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerKeys: ProviderKeyMap;
  setProviderKey: (provider: AiProvider, value: string) => void;
  handleSettingsSave: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  providerKeys,
  setProviderKey,
  handleSettingsSave,
}) => {
  const [visibleProviders, setVisibleProviders] = React.useState<ProviderVisibilityMap>(
    () => createInitialVisibilityMap(),
  );

  React.useEffect(() => {
    if (!isOpen) {
      setVisibleProviders(createInitialVisibilityMap());
    }
  }, [isOpen]);

  const toggleProviderVisibility = (provider: AiProvider) => {
    setVisibleProviders((previous) => ({
      ...previous,
      [provider]: !previous[provider],
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>LLM Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            {AI_PROVIDER_METADATA.map(({ value: provider, label, inputPlaceholder }) => {
              const isVisible = visibleProviders[provider];
              const providerKey = providerKeys[provider] ?? "";

              return (
                <label key={provider} className="flex flex-col gap-1 text-sm">
                  {label} API Key
                  <div className="relative">
                    <input
                      value={providerKey}
                      onChange={(event) => setProviderKey(provider, event.target.value)}
                      type={isVisible ? "text" : "password"}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder={inputPlaceholder}
                    />
                    <button
                      type="button"
                      onClick={() => toggleProviderVisibility(provider)}
                      className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                      aria-label={
                        isVisible
                          ? `Hide ${label} API key`
                          : `Show ${label} API key`
                      }
                    >
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              );
            })}
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
