import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  DraftDetail,
  DraftRecord,
  MarkDraftPromotedRequest,
  SaveDraftRequest,
} from "./types";

// Tracks what's being auto-saved (draft vs file)
type SaveTarget =
  | { type: "draft"; draftId: string }
  | { type: "file"; filePath: string };

/**
 * Context for managing draft lifecycle and active save target.
 * - `drafts`: List of all saved drafts
 * - `activeDraftId`/`activeFilePath`: Currently open document
 * - `saveTarget`: Where auto-save should write to
 * - `isReady`: Whether draft system has initialized
 * - `lastAutoSaveAt`: Timestamp for "Last saved" UI display
 */
type DraftManagerContextValue = {
  drafts: DraftRecord[];
  activeDraftId: string | null;
  activeFilePath: string | null;
  saveTarget: SaveTarget | null;
  setActiveDraftId: (draftId: string | null) => void;
  setActiveFilePath: (filePath: string | null) => void;
  refreshDrafts: () => Promise<void>;
  saveDraft: (payload: SaveDraftRequest) => Promise<DraftDetail | null>;
  loadDraft: (draftId: string) => Promise<DraftDetail | null>;
  deleteDraft: (draftId: string) => Promise<void>;
  markDraftPromoted: (payload: MarkDraftPromotedRequest) => Promise<void>;
  isReady: boolean;
  lastAutoSaveAt: string | null;
  setLastAutoSaveAt: (value: string | null) => void;
};

const DraftManagerContext = createContext<DraftManagerContextValue | undefined>(
  undefined,
);

export const DraftManagerProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [activeDraftId, setActiveDraftIdState] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePathState] = useState<string | null>(
    null,
  );
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState<string | null>(null);

  const refreshDrafts = useCallback(async () => {
    try {
      const result = await window.drafts.list();
      setDrafts(Array.isArray(result) ? result : []);
    } catch (error) {
      console.error("Failed to fetch drafts", error);
      setDrafts([]);
    } finally {
      setIsReady(true);
    }
  }, []);

  // Load drafts on mount
  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  // Switches to draft mode (for unsaved work)
  const activateDraftSession = useCallback(
    (draftId: string) => {
      setActiveDraftIdState(draftId);
      setActiveFilePathState(null);
      setSaveTarget({ type: "draft", draftId });
      setLastAutoSaveAt(null);
    },
    [setLastAutoSaveAt],
  );

  // Switches to file mode (for saved documents)
  const activateFileSession = useCallback(
    (filePath: string) => {
      setActiveFilePathState(filePath);
      setActiveDraftIdState(null);
      setSaveTarget({ type: "file", filePath });
      setLastAutoSaveAt(null);
    },
    [setLastAutoSaveAt],
  );

  const setActiveDraftId = useCallback(
    (draftId: string | null) => {
      if (draftId) {
        activateDraftSession(draftId);
      } else {
        setActiveDraftIdState(null);
        setSaveTarget((current) =>
          current?.type === "draft" ? null : current,
        );
      }
    },
    [activateDraftSession],
  );

  const setActiveFilePath = useCallback(
    (filePath: string | null) => {
      if (filePath) {
        activateFileSession(filePath);
      } else {
        setActiveFilePathState(null);
        setSaveTarget((current) => (current?.type === "file" ? null : current));
      }
    },
    [activateFileSession],
  );

  const loadDraft = useCallback(async (draftId: string) => {
    try {
      const draft = await window.drafts.load(draftId);
      return draft ?? null;
    } catch (error) {
      console.error(`Failed to load draft ${draftId}`, error);
      return null;
    }
  }, []);

  const saveDraft = useCallback(
    async (payload: SaveDraftRequest) => {
      try {
        const draft = await window.drafts.save(payload);
        await refreshDrafts();
        if (draft) {
          // Auto-activate newly saved draft
          activateDraftSession(draft.id);
          if (draft.updatedAt) {
            setLastAutoSaveAt(draft.updatedAt);
          }
        }
        return draft ?? null;
      } catch (error) {
        console.error("Failed to save draft", error);
        return null;
      }
    },
    [activateDraftSession, refreshDrafts],
  );

  const deleteDraft = useCallback(
    async (draftId: string) => {
      try {
        await window.drafts.delete(draftId);
      } catch (error) {
        console.error(`Failed to delete draft ${draftId}`, error);
      } finally {
        await refreshDrafts();
        // Clear active state if deleting current draft
        setActiveDraftIdState((current) =>
          current === draftId ? null : current,
        );
        let removedDraftTarget = false;
        setSaveTarget((current) => {
          if (current?.type === "draft" && current.draftId === draftId) {
            removedDraftTarget = true;
            return null;
          }
          return current;
        });
        if (removedDraftTarget) {
          setLastAutoSaveAt(null);
        }
      }
    },
    [refreshDrafts],
  );

  const markDraftPromoted = useCallback(
    async (payload: MarkDraftPromotedRequest) => {
      try {
        await window.drafts.markPromoted(payload);
      } catch (error) {
        console.error(
          `Failed to mark draft ${payload.draftId} as promoted`,
          error,
        );
      } finally {
        await refreshDrafts();
      }
    },
    [refreshDrafts],
  );

  const value = useMemo<DraftManagerContextValue>(
    () => ({
      drafts,
      activeDraftId,
      activeFilePath,
      saveTarget,
      setActiveDraftId,
      setActiveFilePath,
      refreshDrafts,
      saveDraft,
      loadDraft,
      deleteDraft,
      markDraftPromoted,
      isReady,
      lastAutoSaveAt,
      setLastAutoSaveAt,
    }),
    [
      drafts,
      activeDraftId,
      activeFilePath,
      saveTarget,
      setActiveDraftId,
      setActiveFilePath,
      refreshDrafts,
      saveDraft,
      loadDraft,
      deleteDraft,
      markDraftPromoted,
      isReady,
      lastAutoSaveAt,
    ],
  );

  return (
    <DraftManagerContext.Provider value={value}>
      {children}
    </DraftManagerContext.Provider>
  );
};

export const useDraftManager = () => {
  const context = useContext(DraftManagerContext);
  if (!context) {
    throw new Error(
      "useDraftManager must be used within a DraftManagerProvider",
    );
  }
  return context;
};
