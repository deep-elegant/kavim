import React, { useEffect, useMemo, useState } from "react";
import { useCanvasData } from "@/core/canvas/CanvasDataContext";
import { DraftRecoveryDialog } from "@/components/DraftRecoveryDialog";
import { useDraftManager } from "./DraftManagerContext";

export const DraftRecoveryManager = () => {
  const { setCanvasState } = useCanvasData();
  const {
    drafts,
    loadDraft,
    deleteDraft,
    setActiveDraftId,
    activeDraftId,
    isReady,
  } = useDraftManager();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);

  const activeDrafts = useMemo(
    () => drafts.filter((draft) => !draft.promotedAt && draft.id !== activeDraftId),
    [activeDraftId, drafts],
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (activeDrafts.length > 0) {
      setIsDialogOpen(true);
    } else {
      setIsDialogOpen(false);
    }
  }, [activeDrafts, isReady]);

  const handleResume = async (draftId: string) => {
    setIsProcessingId(draftId);
    const draft = await loadDraft(draftId);
    setIsProcessingId(null);

    if (!draft) {
      await deleteDraft(draftId);
      return;
    }

    const nodes = Array.isArray(draft.canvas.nodes) ? draft.canvas.nodes : [];
    const edges = Array.isArray(draft.canvas.edges) ? draft.canvas.edges : [];
    setCanvasState(nodes, edges);
    setActiveDraftId(draftId);
    window.dispatchEvent(
      new CustomEvent("canvas:manual-save", {
        detail: {
          nodes: JSON.parse(JSON.stringify(nodes)),
          edges: JSON.parse(JSON.stringify(edges)),
        },
      }),
    );
    setIsDialogOpen(false);
  };

  const handleDiscard = async (draftId: string) => {
    setIsProcessingId(draftId);
    await deleteDraft(draftId);
    if (draftId === activeDraftId) {
      setActiveDraftId(null);
    }
    setIsProcessingId(null);
  };

  const handleClose = () => {
    setIsProcessingId(null);
    setIsDialogOpen(false);
  };

  return (
    <DraftRecoveryDialog
      isOpen={isDialogOpen}
      drafts={activeDrafts}
      onResume={handleResume}
      onDiscard={handleDiscard}
      onClose={handleClose}
      processingId={isProcessingId}
    />
  );
};
