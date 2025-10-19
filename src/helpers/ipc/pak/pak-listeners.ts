import { app, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveOutputPath } from "@/core/pak/packer";
import { readPak } from "@/core/pak/unpacker";
import { type PakOperationResult, type SavePakRequest, type PakAssetInput } from "@/core/pak/types";
import { registerPakProtocol, setActivePak, getActivePak } from "@/core/pak/pak-manager";
import { PAK_LOAD_CHANNEL, PAK_SAVE_CHANNEL } from "./pak-channels";
import {
  buildManifest,
  createPakArchive,
  getCanvasFromPak,
} from "@/core/pak/pak-utils";

const savePakFile = async (payload: SavePakRequest, previousAssets: PakAssetInput[]): Promise<PakOperationResult> => {
  const baseDirectory = app.getPath("documents");
  const outputPath = resolveOutputPath(baseDirectory, payload.fileName, payload.directory);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const manifest = buildManifest(outputPath);
  await createPakArchive(outputPath, payload.canvas, manifest, payload.assets);

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

  ipcMain.handle(PAK_SAVE_CHANNEL, async (_event, payload: SavePakRequest) => {
    const activePak = getActivePak();
    let previousAssets: PakAssetInput[] = [];
    if (activePak) {
      previousAssets = Object.entries(activePak.files).filter(([path]) => path.startsWith("assets/"))
        .map(([path, data]) => ({ path, data }));
    }
    const result = await savePakFile(payload, previousAssets);
    return result;
  });

  ipcMain.handle(PAK_LOAD_CHANNEL, async (_event, filePath: string) => {
    const result = await loadPakFile(filePath);
    return result;
  });
};
