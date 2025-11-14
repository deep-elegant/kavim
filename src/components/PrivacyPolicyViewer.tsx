import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import policyHtml from "@/content/privacy-policy.html?raw";

const overrideStyles = `
.kavim-policy [data-custom-class='body'] {
  font-family: var(--font-sans), "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  color: hsl(var(--foreground)) !important;
  background: transparent !important;
}

.kavim-policy .policy-surface {
  background: hsl(var(--card));
  border-radius: 1rem;
  box-shadow: 0 10px 35px rgb(0 0 0 / 0.15);
  padding: 2rem;
}

.kavim-policy [data-custom-class='title'],
.kavim-policy [data-custom-class='heading_1'],
.kavim-policy [data-custom-class='heading_2'] {
  font-family: var(--font-sans), "Inter", system-ui, sans-serif !important;
  color: hsl(var(--foreground)) !important;
}

.kavim-policy [data-custom-class='body_text'],
.kavim-policy [data-custom-class='link'] {
  font-family: var(--font-sans), "Inter", system-ui, sans-serif !important;
  color: hsl(var(--muted-foreground)) !important;
}

.kavim-policy [data-custom-class='link'] a {
  color: hsl(var(--primary)) !important;
}
`;

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
        <div className="scrollbar-thin kavim-policy h-[65vh] overflow-y-auto px-1 text-sm">
          <style>{overrideStyles}</style>
          <div className="policy-surface">
            <div dangerouslySetInnerHTML={{ __html: policyHtml }} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
