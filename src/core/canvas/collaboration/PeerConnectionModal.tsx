import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PeerConnectionPanel } from "./PeerConnectionPanel";

interface PeerConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: "initiator" | "responder";
}

/**
 * Modal dialog for manual WebRTC peer connection setup.
 * - Different UI flow for initiator vs responder roles
 * - Used for peer-to-peer connection without a signaling server
 * - Users manually exchange SDP offers/answers and ICE candidates
 */
export function PeerConnectionModal({
  isOpen,
  onClose,
  role,
}: PeerConnectionModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Large modal for displaying multiple text areas with connection data */}
      <DialogContent className="grid h-[80vh] max-w-4xl grid-rows-[auto,1fr] content-start overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>
            Connection - {role === "initiator" ? "Initiator" : "Responder"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex h-full flex-col overflow-hidden">
          <PeerConnectionPanel role={role} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
