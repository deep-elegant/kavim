import { app, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { createPak, resolveOutputPath } from "@/core/pak/packer";
import { readPak } from "@/core/pak/unpacker";
import {
  type CanvasSnapshot,
  type PakAssetInput,
  type PakManifest,
  type PakOperationResult,
  type SavePakRequest,
} from "@/core/pak/types";
import { registerPakProtocol, setActivePak } from "@/core/pak/pak-manager";
import { PAK_LOAD_CHANNEL, PAK_SAVE_CHANNEL } from "./pak-channels";

const toBuffer = (data: PakAssetInput["data"]): Buffer => {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(data));
  }
  if (Array.isArray(data)) {
    return Buffer.from(data);
  }
  return Buffer.from(String(data));
};

const ensureCanvas = (canvas: CanvasSnapshot): CanvasSnapshot => {
  const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
  const edges = Array.isArray(canvas.edges) ? canvas.edges : [];
  return { nodes, edges };
};

const getCanvasFromPak = (files: Record<string, Buffer>): CanvasSnapshot => {
  const canvasBuffer = files["canvas.json"];
  if (!canvasBuffer) {
    return { nodes: [], edges: [] };
  }

  try {
    const parsed = JSON.parse(canvasBuffer.toString("utf-8")) as CanvasSnapshot;
    return ensureCanvas(parsed);
  } catch (error) {
    console.error("Failed to parse canvas.json from pak", error);
    return { nodes: [], edges: [] };
  }
};

const buildManifest = (filePath: string, extras?: Partial<PakManifest>): PakManifest => {
  const fileName = path.parse(filePath).name;
  return {
    name: fileName,
    savedAt: new Date().toISOString(),
    version: 1,
    ...extras,
  };
};

const prepareAssetFiles = (
  canvas: CanvasSnapshot,
  manifest: PakManifest,
  assets: PakAssetInput[] = [],
) => {
  const serializedCanvas = Buffer.from(JSON.stringify(ensureCanvas(canvas)));
  const manifestBuffer = Buffer.from(JSON.stringify(manifest));
  const normalizedAssets = assets.map(({ path: assetPath, data }) => ({
    path: assetPath,
    data: toBuffer(data),
  }));

  return [
    { path: "manifest.json", data: manifestBuffer },
    { path: "canvas.json", data: serializedCanvas },
    ...normalizedAssets,
  ];
};

const savePakFile = async (payload: SavePakRequest): Promise<PakOperationResult> => {
  const baseDirectory = app.getPath("documents");
  const outputPath = resolveOutputPath(baseDirectory, payload.fileName, payload.directory);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const manifest = buildManifest(outputPath);
  const assetFiles = prepareAssetFiles(
    payload.canvas,
    manifest,
    payload.assets ?? [],
  );
  await createPak(outputPath, assetFiles, manifest);

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
    const result = await savePakFile(payload);
    return result;
  });

  ipcMain.handle(PAK_LOAD_CHANNEL, async (_event, filePath: string) => {
    const result = await loadPakFile(filePath);
    return result;
  });
};
