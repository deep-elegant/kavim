import { PAK_LOAD_CHANNEL, PAK_SAVE_CHANNEL } from "./pak-channels";

type CanvasSnapshot = {
  nodes: unknown[];
  edges: unknown[];
};

type SavePakRequest = {
  fileName: string;
  directory?: string;
  canvas: CanvasSnapshot;
  assets?: { path: string; data: unknown }[];
};

type PakOperationResult = {
  manifest: unknown;
  canvas: CanvasSnapshot;
  filePath: string;
};

export function exposePakContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");

  contextBridge.exposeInMainWorld("projectPak", {
    save: (payload: SavePakRequest): Promise<PakOperationResult> =>
      ipcRenderer.invoke(PAK_SAVE_CHANNEL, payload),
    load: (filePath: string): Promise<PakOperationResult> =>
      ipcRenderer.invoke(PAK_LOAD_CHANNEL, filePath),
  });
}
