import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useCanvasData } from "@/core/canvas/CanvasDataContext";
import { useDraftManager } from "./DraftManagerContext";

// Debounce delay after last change before saving
const AUTO_SAVE_DEBOUNCE_MS = 2000;
// Periodic save interval even if canvas hasn't changed
const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000;
// Retry delay after failed save attempt
const AUTO_SAVE_RETRY_MS = 5000;

type SaveReason = "debounce" | "interval" | "queued";

type ManualSaveDetail = {
  nodes: unknown[];
  edges: unknown[];
  filePath?: string;
};

// Deep clones canvas data to prevent mutation during async save
const sanitizeCanvas = (nodes: unknown, edges: unknown) => {
  const safeNodes = Array.isArray(nodes) ? JSON.parse(JSON.stringify(nodes)) : [];
  const safeEdges = Array.isArray(edges) ? JSON.parse(JSON.stringify(edges)) : [];
  return { nodes: safeNodes, edges: safeEdges };
};

const splitFilePath = (filePath: string) => {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index === -1) {
    return { directory: undefined, fileName: filePath };
  }

  const directory = filePath.slice(0, index);
  const fileName = filePath.slice(index + 1);
  return { directory: directory || undefined, fileName };
};

/**
 * Automatically saves canvas changes to drafts or files.
 * - Debounces rapid changes to avoid excessive saves
 * - Falls back to periodic saves as safety net
 * - Retries failed saves to handle temporary network/disk issues
 * - Skips redundant saves by comparing JSON signatures
 */
export const AutoSaveManager: React.FC = () => {
  const { nodes, edges } = useCanvasData();
  const {
    drafts,
    saveTarget,
    saveDraft,
    isReady,
    setLastAutoSaveAt,
  } = useDraftManager();

  // Always-current snapshot avoids stale closure issues
  const latestSnapshotRef = useRef<{ nodes: unknown; edges: unknown }>({
    nodes,
    edges,
  });
  // Tracks last saved state to skip redundant saves
  const lastSavedSignatureRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Prevents concurrent saves that could cause race conditions
  const savingRef = useRef(false);
  // Queues save when one is already in progress
  const rerunRequestedRef = useRef(false);
  const needsSaveRef = useRef(false);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeDraftMeta = useMemo(() => {
    if (saveTarget?.type !== "draft") {
      return null;
    }
    return drafts.find((draft) => draft.id === saveTarget.draftId) ?? null;
  }, [drafts, saveTarget]);

  /**
   * Performs the actual save operation to draft or file.
   * - Compares JSON signature to skip redundant saves
   * - Handles both draft and file save targets
   * - Queues retry on failure instead of losing changes
   */
  const performSave = useCallback(
    async (reason: SaveReason) => {
      void reason;
      if (!isReady) {
        return;
      }

      const snapshot = sanitizeCanvas(
        latestSnapshotRef.current.nodes,
        latestSnapshotRef.current.edges,
      );
      const signature = JSON.stringify(snapshot);

      // Skip saving empty canvas with no target
      if (!saveTarget && snapshot.nodes.length === 0 && snapshot.edges.length === 0) {
        lastSavedSignatureRef.current = signature;
        needsSaveRef.current = false;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        return;
      }

      // Skip if nothing changed since last save
      if (signature === lastSavedSignatureRef.current) {
        needsSaveRef.current = false;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        return;
      }

      // Queue save if one is already running
      if (savingRef.current) {
        rerunRequestedRef.current = true;
        return;
      }

      savingRef.current = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      try {
        if (saveTarget?.type === "file") {
          const { fileName, directory } = splitFilePath(saveTarget.filePath);
          await window.projectPak.save({
            fileName,
            directory,
            canvas: snapshot,
          });

          lastSavedSignatureRef.current = signature;
          needsSaveRef.current = false;
          const timestamp = new Date().toISOString();
          setLastAutoSaveAt(timestamp);
        } else {
          const draft = await saveDraft({
            draftId: saveTarget?.type === "draft" ? saveTarget.draftId : undefined,
            projectName: activeDraftMeta?.projectName ?? null,
            filePath: activeDraftMeta?.filePath ?? null,
            canvas: snapshot,
          });

          if (draft) {
            lastSavedSignatureRef.current = signature;
            needsSaveRef.current = false;
            if (retryTimerRef.current) {
              clearTimeout(retryTimerRef.current);
              retryTimerRef.current = null;
            }
          } else {
            needsSaveRef.current = true;
            if (!retryTimerRef.current) {
              retryTimerRef.current = setTimeout(() => {
                retryTimerRef.current = null;
                void performSave("queued");
              }, AUTO_SAVE_RETRY_MS);
            }
          }
        }
      } catch (error) {
        console.error("Auto-save failed", error);
        needsSaveRef.current = true;
        if (!retryTimerRef.current) {
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            void performSave("queued");
          }, AUTO_SAVE_RETRY_MS);
        }
      } finally {
        savingRef.current = false;
        if (rerunRequestedRef.current) {
          rerunRequestedRef.current = false;
          if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
          }
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            void performSave("queued");
          }, AUTO_SAVE_DEBOUNCE_MS);
        }
      }
    },
    [activeDraftMeta, isReady, saveDraft, saveTarget, setLastAutoSaveAt],
  );

  const scheduleDebouncedSave = useCallback(
    (delay = AUTO_SAVE_DEBOUNCE_MS) => {
      if (!isReady) {
        return;
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void performSave("debounce");
      }, delay);
    },
    [isReady, performSave],
  );

  // Trigger debounced save on any canvas change
  useEffect(() => {
    latestSnapshotRef.current = { nodes, edges };
    if (!isReady) {
      return;
    }
    needsSaveRef.current = true;
    scheduleDebouncedSave();
  }, [nodes, edges, isReady, scheduleDebouncedSave]);

  // Periodic save as safety net (in case debounce keeps resetting)
  useEffect(() => {
    if (!isReady) {
      return;
    }

    intervalTimerRef.current = setInterval(() => {
      if (!needsSaveRef.current) {
        return;
      }
      void performSave("interval");
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
        intervalTimerRef.current = null;
      }
    };
  }, [isReady, performSave]);

  // Reschedule save if needed when manager becomes ready
  useEffect(() => {
    if (!isReady || !needsSaveRef.current) {
      return;
    }
    scheduleDebouncedSave();
  }, [isReady, scheduleDebouncedSave]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
        intervalTimerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  // Sync with manual saves (from File > Save menu)
  useEffect(() => {
    const handleManualSave = (event: Event) => {
      const customEvent = event as CustomEvent<ManualSaveDetail>;
      if (!customEvent.detail) {
        return;
      }

      // Update signature to prevent auto-save from re-saving same content
      const snapshot = sanitizeCanvas(customEvent.detail.nodes, customEvent.detail.edges);
      latestSnapshotRef.current = snapshot;
      lastSavedSignatureRef.current = JSON.stringify(snapshot);
      needsSaveRef.current = false;

      // Clear pending saves since manual save just completed
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (customEvent.detail.filePath) {
        const timestamp = new Date().toISOString();
        setLastAutoSaveAt(timestamp);
      }
    };

    window.addEventListener("canvas:manual-save", handleManualSave);
    return () => {
      window.removeEventListener("canvas:manual-save", handleManualSave);
    };
  }, [setLastAutoSaveAt]);

  return null;
};
