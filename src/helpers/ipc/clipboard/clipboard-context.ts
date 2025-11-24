import { WRITE_CLIPBOARD_TEXT_CHANNEL, READ_CLIPBOARD_TEXT_CHANNEL } from "./clipboard-channels";

export function exposeClipboardContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");

  contextBridge.exposeInMainWorld("clipboard", {
    writeText: (text: string) =>
      ipcRenderer.invoke(WRITE_CLIPBOARD_TEXT_CHANNEL, text),
    readText: () => ipcRenderer.invoke(READ_CLIPBOARD_TEXT_CHANNEL),
  });
}
