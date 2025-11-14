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
import { openExternal } from "@/utils/openExternal";

type AnalyticsConsentDialogProps = {
  open: boolean;
  onAllow: () => void;
  onDecline: () => void;
  requiresExplicitOptIn: boolean;
  privacyPolicyUrl: string;
  configPath?: string;
};

export function AnalyticsConsentDialog({
  open,
  onAllow,
  onDecline,
  requiresExplicitOptIn,
  privacyPolicyUrl,
  configPath,
}: AnalyticsConsentDialogProps) {
  const handlePrivacyClick = () => openExternal(privacyPolicyUrl);

  return (
    <Dialog open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Help improve Kavim</DialogTitle>
          <DialogDescription>
            Share anonymous usage analytics so we can fix bugs and prioritize
            features. No personal data or project content is collected, and you
            can change your mind any time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Only aggregated screen views and feature clicks are recorded.</li>
            <li>Data is stored on DeepElegant servers with Umami.</li>
            <li>
              Preferences live locally at <code>{configPath ?? "~/.kavim-analytics.json"}</code>.
            </li>
          </ul>
          {requiresExplicitOptIn ? (
            <p className="text-sm font-medium text-foreground">
              Because of your region, analytics stays off until you explicitly
              enable it.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              We recommend enabling analytics to help guide the roadmap, but it
              is entirely optional.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={handlePrivacyClick}>
            Privacy policy
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onDecline}>
              No thanks
            </Button>
            <Button onClick={onAllow} autoFocus={!requiresExplicitOptIn}>
              Allow analytics
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
