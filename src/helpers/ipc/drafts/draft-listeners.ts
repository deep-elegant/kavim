import { ipcMain } from "electron";
import {
  DRAFT_CLEANUP_CHANNEL,
  DRAFT_DELETE_CHANNEL,
  DRAFT_LIST_CHANNEL,
  DRAFT_LOAD_CHANNEL,
  DRAFT_MARK_PROMOTED_CHANNEL,
  DRAFT_SAVE_CHANNEL,
} from "./draft-channels";
import {
  cleanupDrafts,
  deleteDraft,
  listDrafts,
  loadDraft,
  markDraftPromoted,
  saveDraft,
} from "@/core/drafts/storage";
import type {
  CleanupDraftsRequest,
  MarkDraftPromotedRequest,
  SaveDraftRequest,
} from "@/core/drafts/types";

export const addDraftEventListeners = () => {
  void cleanupDrafts();

  ipcMain.handle(DRAFT_SAVE_CHANNEL, async (_event, payload: SaveDraftRequest) => {
    return saveDraft(payload);
  });

  ipcMain.handle(DRAFT_LOAD_CHANNEL, async (_event, draftId: string) => {
    return loadDraft(draftId);
  });

  ipcMain.handle(DRAFT_LIST_CHANNEL, async () => {
    return listDrafts();
  });

  ipcMain.handle(DRAFT_DELETE_CHANNEL, async (_event, draftId: string) => {
    await deleteDraft(draftId);
  });

  ipcMain.handle(DRAFT_MARK_PROMOTED_CHANNEL, async (_event, payload: MarkDraftPromotedRequest) => {
    await markDraftPromoted(payload);
  });

  ipcMain.handle(DRAFT_CLEANUP_CHANNEL, async (_event, payload?: CleanupDraftsRequest) => {
    await cleanupDrafts(payload);
  });
};
