import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [hasDismissed, setHasDismissed] = useState(false);
  const sessionStartRef = useRef<number>(Date.now());

  // Only show drafts that haven't been saved to files and aren't currently open
  const recoverableDrafts = useMemo(() => {
    const sessionStart = sessionStartRef.current;
    return drafts
      .filter((draft) => !draft.promotedAt && draft.id !== activeDraftId)
      .filter((draft) => {
        const updatedAt = Date.parse(draft.updatedAt);
        if (!Number.isNaN(updatedAt)) {
          return updatedAt < sessionStart;
        }
        const createdAt = draft.createdAt ? Date.parse(draft.createdAt) : NaN;
        if (!Number.isNaN(createdAt)) {
          return createdAt < sessionStart;
        }
        return true;
      });
  }, [activeDraftId, drafts]);

  // Show dialog when draft system is ready and there are drafts to recover
  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (recoverableDrafts.length === 0) {
      setIsDialogOpen(false);
      setHasDismissed(false);
      return;
    }

    if (!hasDismissed) {
      setIsDialogOpen(true);
    }
  }, [recoverableDrafts, hasDismissed, isReady]);

  const handleDialogClose = useCallback(
    (options?: { dismissed?: boolean }) => {
      setIsProcessingId(null);
      if (options?.dismissed) {
        setHasDismissed(true);
      }
      setIsDialogOpen(false);
    },
    [setHasDismissed, setIsDialogOpen, setIsProcessingId],
  );

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
    handleDialogClose();
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

  return (
    <DraftRecoveryDialog
      isOpen={isDialogOpen}
      drafts={recoverableDrafts}
      onResume={handleResume}
      onDiscard={handleDiscard}
      onClose={handleDialogClose}
      processingId={isProcessingId}
    />
  );
};
