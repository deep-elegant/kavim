import React, { useEffect, useMemo, useState } from "react";
import { useCanvasData } from "@/core/canvas/CanvasDataContext";
import { DraftRecoveryDialog } from "@/components/DraftRecoveryDialog";
import { useDraftManager } from "./DraftManagerContext";

/**
 * Shows recovery dialog for unsaved drafts on app launch.
 * - Filters out promoted (saved) drafts and currently active draft
 * - Handles resume (load draft) and discard (delete draft) actions
 * - Syncs auto-save state after resuming to prevent immediate re-save
 */
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
  // Prevents double-clicks during async operations
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);

  // Only show drafts that haven't been saved to files and aren't currently open
  const activeDrafts = useMemo(
    () => drafts.filter((draft) => !draft.promotedAt && draft.id !== activeDraftId),
    [activeDraftId, drafts],
  );

  // Show dialog when draft system is ready and there are drafts to recover
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
      // Draft failed to load, clean it up
      await deleteDraft(draftId);
      return;
    }

    const nodes = Array.isArray(draft.canvas.nodes) ? draft.canvas.nodes : [];
    const edges = Array.isArray(draft.canvas.edges) ? draft.canvas.edges : [];
    setCanvasState(nodes, edges);
    setActiveDraftId(draftId);
    // Notify auto-save that content is already saved (prevents immediate re-save)
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
    // Clean up if discarding currently active draft
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
