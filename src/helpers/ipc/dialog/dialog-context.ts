import { OPEN_FILE_DIALOG_CHANNEL } from "./dialog-channels";

export function exposeDialogContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");

  contextBridge.exposeInMainWorld("dialog", {
    openFile: () => ipcRenderer.invoke(OPEN_FILE_DIALOG_CHANNEL),
  });
}
