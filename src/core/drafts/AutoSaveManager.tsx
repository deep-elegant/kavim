import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useCanvasData } from "@/core/canvas/CanvasDataContext";
import { useDraftManager } from "./DraftManagerContext";

const AUTO_SAVE_DEBOUNCE_MS = 2000;
const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_SAVE_RETRY_MS = 5000;

type SaveReason = "debounce" | "interval" | "queued";

type ManualSaveDetail = {
  nodes: unknown[];
  edges: unknown[];
  filePath?: string;
};

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

export const AutoSaveManager: React.FC = () => {
  const { nodes, edges } = useCanvasData();
  const {
    drafts,
    saveTarget,
    saveDraft,
    isReady,
    setLastAutoSaveAt,
  } = useDraftManager();

  const latestSnapshotRef = useRef<{ nodes: unknown; edges: unknown }>({
    nodes,
    edges,
  });
  const lastSavedSignatureRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const savingRef = useRef(false);
  const rerunRequestedRef = useRef(false);
  const needsSaveRef = useRef(false);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeDraftMeta = useMemo(() => {
    if (saveTarget?.type !== "draft") {
      return null;
    }
    return drafts.find((draft) => draft.id === saveTarget.draftId) ?? null;
  }, [drafts, saveTarget]);

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

      if (!saveTarget && snapshot.nodes.length === 0 && snapshot.edges.length === 0) {
        lastSavedSignatureRef.current = signature;
        needsSaveRef.current = false;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        return;
      }

      if (signature === lastSavedSignatureRef.current) {
        needsSaveRef.current = false;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        return;
      }

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

  useEffect(() => {
    latestSnapshotRef.current = { nodes, edges };
    if (!isReady) {
      return;
    }
    needsSaveRef.current = true;
    scheduleDebouncedSave();
  }, [nodes, edges, isReady, scheduleDebouncedSave]);

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

  useEffect(() => {
    if (!isReady || !needsSaveRef.current) {
      return;
    }
    scheduleDebouncedSave();
  }, [isReady, scheduleDebouncedSave]);

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

  useEffect(() => {
    const handleManualSave = (event: Event) => {
      const customEvent = event as CustomEvent<ManualSaveDetail>;
      if (!customEvent.detail) {
        return;
      }

      const snapshot = sanitizeCanvas(customEvent.detail.nodes, customEvent.detail.edges);
      latestSnapshotRef.current = snapshot;
      lastSavedSignatureRef.current = JSON.stringify(snapshot);
      needsSaveRef.current = false;

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
