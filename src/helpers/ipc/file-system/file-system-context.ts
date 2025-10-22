import {
  OPEN_DIRECTORY_DIALOG_CHANNEL,
  OPEN_FILE_DIALOG_CHANNEL,
  READ_FILE_AS_DATA_URL_CHANNEL,
  SAVE_CLIPBOARD_IMAGE_CHANNEL,
} from "./file-system-channels";

export function exposeFileSystemContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");

  contextBridge.exposeInMainWorld("fileSystem", {
    readFileAsDataUrl: (filePath: string) =>
      ipcRenderer.invoke(READ_FILE_AS_DATA_URL_CHANNEL, filePath),
    openFile: (options?: unknown) =>
      ipcRenderer.invoke(OPEN_FILE_DIALOG_CHANNEL, options),
    openDirectory: () => ipcRenderer.invoke(OPEN_DIRECTORY_DIALOG_CHANNEL),
    saveClipboardImage: (base64Data: string, extension: string) =>
      ipcRenderer.invoke(SAVE_CLIPBOARD_IMAGE_CHANNEL, base64Data, extension),
  });
}
