import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import policyHtml from "@/content/privacy-policy.html?raw";

type PrivacyPolicyViewerProps = {
  open: boolean;
  onClose: () => void;
};

export function PrivacyPolicyViewer({ open, onClose }: PrivacyPolicyViewerProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] w-full max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Privacy policy</DialogTitle>
        </DialogHeader>
        <div className="scrollbar-thin prose h-[65vh] overflow-y-auto px-1 text-sm">
          <div dangerouslySetInnerHTML={{ __html: policyHtml }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
