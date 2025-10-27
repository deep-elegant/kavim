import { APP_GET_INFO_CHANNEL } from "./app-channels";

export function exposeAppContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");

  contextBridge.exposeInMainWorld("appInfo", {
    get: () => ipcRenderer.invoke(APP_GET_INFO_CHANNEL),
  });
}
