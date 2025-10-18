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

type DraftManagerContextValue = {
  drafts: DraftRecord[];
  activeDraftId: string | null;
  setActiveDraftId: (draftId: string | null) => void;
  refreshDrafts: () => Promise<void>;
  saveDraft: (payload: SaveDraftRequest) => Promise<DraftDetail | null>;
  loadDraft: (draftId: string) => Promise<DraftDetail | null>;
  deleteDraft: (draftId: string) => Promise<void>;
  markDraftPromoted: (payload: MarkDraftPromotedRequest) => Promise<void>;
  isReady: boolean;
};

const DraftManagerContext = createContext<DraftManagerContextValue | undefined>(undefined);

export const DraftManagerProvider = ({ children }: { children: React.ReactNode }) => {
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [activeDraftId, setActiveDraftIdState] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

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

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  const loadDraft = useCallback(async (draftId: string) => {
    try {
      const draft = await window.drafts.load(draftId);
      return draft ?? null;
    } catch (error) {
      console.error(`Failed to load draft ${draftId}`, error);
      return null;
    }
  }, []);

  const saveDraft = useCallback(async (payload: SaveDraftRequest) => {
    try {
      const draft = await window.drafts.save(payload);
      await refreshDrafts();
      return draft;
    } catch (error) {
      console.error("Failed to save draft", error);
      return null;
    }
  }, [refreshDrafts]);

  const deleteDraft = useCallback(async (draftId: string) => {
    try {
      await window.drafts.delete(draftId);
    } catch (error) {
      console.error(`Failed to delete draft ${draftId}`, error);
    } finally {
      await refreshDrafts();
    }
  }, [refreshDrafts]);

  const markDraftPromoted = useCallback(async (payload: MarkDraftPromotedRequest) => {
    try {
      await window.drafts.markPromoted(payload);
    } catch (error) {
      console.error(`Failed to mark draft ${payload.draftId} as promoted`, error);
    } finally {
      await refreshDrafts();
    }
  }, [refreshDrafts]);

  const setActiveDraftId = useCallback(
    (draftId: string | null) => {
      setActiveDraftIdState(draftId);
    },
    [],
  );

  const value = useMemo<DraftManagerContextValue>(
    () => ({
      drafts,
      activeDraftId,
      setActiveDraftId,
      refreshDrafts,
      saveDraft,
      loadDraft,
      deleteDraft,
      markDraftPromoted,
      isReady,
    }),
    [
      drafts,
      activeDraftId,
      refreshDrafts,
      saveDraft,
      loadDraft,
      deleteDraft,
      markDraftPromoted,
      setActiveDraftId,
      isReady,
    ],
  );

  return <DraftManagerContext.Provider value={value}>{children}</DraftManagerContext.Provider>;
};

export const useDraftManager = () => {
  const context = useContext(DraftManagerContext);
  if (!context) {
    throw new Error("useDraftManager must be used within a DraftManagerProvider");
  }
  return context;
};
