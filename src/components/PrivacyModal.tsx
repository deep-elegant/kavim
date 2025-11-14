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
import { useAnalyticsPreferences } from "@/core/analytics/AnalyticsProvider";

type PrivacyModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function PrivacyModal({ isOpen, onClose }: PrivacyModalProps) {
  const {
    preferences,
    analyticsAllowed,
    analyticsActive,
    doNotTrackEnabled,
    configPath,
    setAnalyticsEnabled,
    refreshPreferences,
    openPrivacyPolicy,
  } = useAnalyticsPreferences();

  React.useEffect(() => {
    if (isOpen) {
      refreshPreferences();
    }
  }, [isOpen, refreshPreferences]);

  const handleEnable = () => setAnalyticsEnabled(true);
  const handleDisable = () => setAnalyticsEnabled(false);

  const statusLabel = analyticsActive
    ? "Analytics is enabled."
    : analyticsAllowed
      ? "Analytics enabled, but Do Not Track is blocking data collection."
      : "Analytics is currently disabled.";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Privacy & analytics</DialogTitle>
          <DialogDescription>
            Control anonymous telemetry and review where preferences are stored.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="border-border rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">Anonymous analytics</p>
                <p className="text-muted-foreground text-sm">{statusLabel}</p>
                {doNotTrackEnabled ? (
                  <p className="text-xs text-muted-foreground">
                    Your operating system/browser Do Not Track preference forces
                    analytics off even if allowed here.
                  </p>
                ) : null}
              </div>
              {analyticsAllowed ? (
                <Button variant="outline" onClick={handleDisable}>
                  Disable
                </Button>
              ) : (
                <Button onClick={handleEnable}>Enable</Button>
              )}
            </div>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Preferences file: {configPath ?? "~/.kavim-analytics.json"}</p>
            <p>
              Delete this file to reset your choice. Current consent version: {" "}
              {preferences.consentVersion}.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={openPrivacyPolicy}>
            View privacy policy
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
