import {
  DRAFT_CLEANUP_CHANNEL,
  DRAFT_DELETE_CHANNEL,
  DRAFT_LIST_CHANNEL,
  DRAFT_LOAD_CHANNEL,
  DRAFT_MARK_PROMOTED_CHANNEL,
  DRAFT_SAVE_CHANNEL,
} from "./draft-channels";

export function exposeDraftContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");

  contextBridge.exposeInMainWorld("drafts", {
    save: (payload: unknown) => ipcRenderer.invoke(DRAFT_SAVE_CHANNEL, payload),
    load: (draftId: string) => ipcRenderer.invoke(DRAFT_LOAD_CHANNEL, draftId),
    list: () => ipcRenderer.invoke(DRAFT_LIST_CHANNEL),
    delete: (draftId: string) => ipcRenderer.invoke(DRAFT_DELETE_CHANNEL, draftId),
    markPromoted: (payload: unknown) =>
      ipcRenderer.invoke(DRAFT_MARK_PROMOTED_CHANNEL, payload),
    cleanup: (payload?: unknown) => ipcRenderer.invoke(DRAFT_CLEANUP_CHANNEL, payload),
  });
}
