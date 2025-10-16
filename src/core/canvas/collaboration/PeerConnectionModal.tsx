import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PeerConnectionPanel } from './PeerConnectionPanel';

interface PeerConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: 'initiator' | 'responder';
}

export function PeerConnectionModal({ isOpen, onClose, role }: PeerConnectionModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>
            Connection - {role === 'initiator' ? 'Initiator' : 'Responder'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <PeerConnectionPanel role={role} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
