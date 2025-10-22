import { app, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveOutputPath } from "@/core/pak/packer";
import { readPak } from "@/core/pak/unpacker";
import {
  type PakOperationResult,
  type SavePakRequest,
  type PakAssetInput,
} from "@/core/pak/types";
import {
  ensureActivePak,
  getActivePak,
  registerPakProtocol,
  removePakAsset,
  setActivePak,
  toBuffer,
  upsertPakAsset,
} from "@/core/pak/pak-manager";
import { guessMimeType } from "@/core/pak/mimeTypes";
import {
  PAK_ADD_ASSET_CHANNEL,
  PAK_LIST_ASSETS_CHANNEL,
  PAK_LOAD_CHANNEL,
  PAK_REMOVE_ASSET_CHANNEL,
  PAK_SAVE_CHANNEL,
  PAK_GET_ASSET_CHANNEL,
} from "./pak-channels";
import {
  buildManifest,
  createPakArchive,
  getCanvasFromPak,
} from "@/core/pak/pak-utils";

const extractAssetInputs = (
  files?: Record<string, Buffer>,
): PakAssetInput[] => {
  if (!files) {
    return [];
  }
  return Object.entries(files)
    .filter(([assetPath]) => assetPath.startsWith("assets/"))
    .map(([assetPath, data]) => ({ path: assetPath, data }));
};

const mergeAssets = (
  base: PakAssetInput[],
  incoming: PakAssetInput[],
): PakAssetInput[] => {
  const assetMap = new Map<string, Buffer>();

  base.forEach((asset) => {
    assetMap.set(asset.path, toBuffer(asset.data));
  });

  incoming.forEach((asset) => {
    assetMap.set(asset.path, toBuffer(asset.data));
  });

  return Array.from(assetMap.entries()).map(([assetPath, buffer]) => ({
    path: assetPath,
    data: buffer,
  }));
};

const savePakFile = async (
  payload: SavePakRequest,
  assets: PakAssetInput[],
): Promise<PakOperationResult> => {
  const baseDirectory = app.getPath("documents");
  const outputPath = resolveOutputPath(
    baseDirectory,
    payload.fileName,
    payload.directory,
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const manifest = buildManifest(outputPath);
  await createPakArchive(outputPath, payload.canvas, manifest, assets);

  const pak = await readPak(outputPath);
  setActivePak({ ...pak, filePath: outputPath });
  const canvas = getCanvasFromPak(pak.files);

  return { manifest: pak.manifest, canvas, filePath: outputPath };
};

const loadPakFile = async (filePath: string): Promise<PakOperationResult> => {
  const pak = await readPak(filePath);
  setActivePak({ ...pak, filePath });
  const canvas = getCanvasFromPak(pak.files);
  return { manifest: pak.manifest, canvas, filePath };
};

export const addPakEventListeners = () => {
  registerPakProtocol();

  let previousAssets: PakAssetInput[] = [];

  const updateCachedAssetsFromActivePak = () => {
    const pak = getActivePak();
    previousAssets = extractAssetInputs(pak?.files);
  };

  ipcMain.handle(PAK_SAVE_CHANNEL, async (_event, payload: SavePakRequest) => {
    const mergedAssets = mergeAssets(previousAssets, payload.assets ?? []);
    const result = await savePakFile(payload, mergedAssets);
    updateCachedAssetsFromActivePak();
    return result;
  });

  ipcMain.handle(PAK_LOAD_CHANNEL, async (_event, filePath: string) => {
    const result = await loadPakFile(filePath);
    updateCachedAssetsFromActivePak();
    return result;
  });

  ipcMain.handle(
    PAK_ADD_ASSET_CHANNEL,
    async (_event, asset: PakAssetInput) => {
      const buffer = upsertPakAsset(asset);
      const normalizedAsset: PakAssetInput = { path: asset.path, data: buffer };
      const existingIndex = previousAssets.findIndex(
        (existing) => existing.path === asset.path,
      );
      if (existingIndex >= 0) {
        previousAssets[existingIndex] = normalizedAsset;
      } else {
        previousAssets.push(normalizedAsset);
      }
      return { path: asset.path, size: buffer.length };
    },
  );

  ipcMain.handle(
    PAK_REMOVE_ASSET_CHANNEL,
    async (_event, assetPath: string) => {
      const removed = removePakAsset(assetPath);
      if (removed) {
        previousAssets = previousAssets.filter(
          (asset) => asset.path !== assetPath,
        );
      }
      return removed;
    },
  );

  ipcMain.handle(PAK_LIST_ASSETS_CHANNEL, async () => {
    const pak = ensureActivePak();
    const assets = extractAssetInputs(pak.files);
    previousAssets = assets;
    return assets.map((asset) => {
      const buffer = Buffer.isBuffer(asset.data)
        ? asset.data
        : toBuffer(asset.data);
      return { path: asset.path, size: buffer.length };
    });
  });

  ipcMain.handle(PAK_GET_ASSET_CHANNEL, async (_event, assetPath: string) => {
    const pak = ensureActivePak();
    const normalizedPath = assetPath.startsWith("pak://")
      ? assetPath.slice("pak://".length)
      : assetPath;
    const file = pak.files[normalizedPath];

    if (!file) {
      return null;
    }

    const buffer = toBuffer(file);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );

    return {
      path: normalizedPath,
      data: arrayBuffer,
      mimeType: guessMimeType(normalizedPath),
    };
  });
};
