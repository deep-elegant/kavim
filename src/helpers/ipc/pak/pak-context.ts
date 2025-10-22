import {
  PAK_ADD_ASSET_CHANNEL,
  PAK_GET_ASSET_CHANNEL,
  PAK_LIST_ASSETS_CHANNEL,
  PAK_LOAD_CHANNEL,
  PAK_REMOVE_ASSET_CHANNEL,
  PAK_SAVE_CHANNEL,
} from "./pak-channels";

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

type PakAssetSummary = {
  path: string;
  size: number;
};

export function exposePakContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");

  contextBridge.exposeInMainWorld("projectPak", {
    save: (payload: SavePakRequest): Promise<PakOperationResult> =>
      ipcRenderer.invoke(PAK_SAVE_CHANNEL, payload),
    load: (filePath: string): Promise<PakOperationResult> =>
      ipcRenderer.invoke(PAK_LOAD_CHANNEL, filePath),
    addAsset: (asset: { path: string; data: unknown }): Promise<PakAssetSummary> =>
      ipcRenderer.invoke(PAK_ADD_ASSET_CHANNEL, asset),
    removeAsset: (assetPath: string): Promise<boolean> =>
      ipcRenderer.invoke(PAK_REMOVE_ASSET_CHANNEL, assetPath),
    listAssets: (): Promise<PakAssetSummary[]> =>
      ipcRenderer.invoke(PAK_LIST_ASSETS_CHANNEL),
    getAssetData: (assetPath: string) => ipcRenderer.invoke(PAK_GET_ASSET_CHANNEL, assetPath),
  });
}
