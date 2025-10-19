import path from "node:path";
import type { Node } from "@xyflow/react";
import type { CanvasSnapshot, PakAssetInput, PakManifest } from "./types";
import { createPak } from "./packer";
import { readPak } from "./unpacker";
import { ImageNodeType } from "@/core/canvas/nodes/ImageNode";

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
  const processedAssets: { path: string; data: Buffer }[] = assets.map(
    ({ path: assetPath, data }) => ({
      path: assetPath,
      data: toBuffer(data),
    }),
  );

  let imageCounter = 0;
  for (const node of canvas.nodes as Node[]) {
    if (
      node.type === "image-node" &&
      (node as ImageNodeType).data.src &&
      (node as ImageNodeType).data.src.startsWith("data:image")
    ) {
      const { src, fileName } = (node as ImageNodeType).data;

      const match = src.match(/^data:image\/(.*?);base64,(.*)$/);
      if (!match) continue;

      const [, extension, base64Data] = match;
      const buffer = Buffer.from(base64Data, "base64");

      const uniqueFileName = fileName
        ? `${path.parse(fileName).name}-${imageCounter}.${extension}`
        : `image-${imageCounter}.${extension}`;
      const assetPath = `assets/${uniqueFileName}`;
      imageCounter++;

      processedAssets.push({ path: assetPath, data: buffer });

      node.data.src = `pak://${assetPath}`;
    }
  }

  /** Check the previous assets are actually in the canvas rightnow */
  const usedCanvasAssetPaths = (canvas.nodes as Node[])
    .filter((node) => node.type === "image-node")
    .map((node) => (node as ImageNodeType).data.src.split("pak://")[1]);

  // Efficent way to remove elements from array, because files can be large - optimization is required here.
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < processedAssets.length; readIndex++) {
    const file = processedAssets[readIndex];
    if (usedCanvasAssetPaths.includes(file.path)) {
      processedAssets[writeIndex++] = file;
    }
  }
  processedAssets.length = writeIndex;

  const serializedCanvas = Buffer.from(JSON.stringify(ensureCanvas(canvas)));
  const manifestBuffer = Buffer.from(JSON.stringify(manifest));

  return [
    { path: "manifest.json", data: manifestBuffer },
    { path: "canvas.json", data: serializedCanvas },
    ...processedAssets,
  ];
};

const createPakArchive = async (
  outputPath: string,
  canvas: CanvasSnapshot,
  manifest: PakManifest,
  assets?: PakAssetInput[],
) => {
  const files = prepareAssetFiles(canvas, manifest, assets ?? []);
  await createPak(outputPath, files, manifest);
};

const readPakArchive = async (filePath: string) => {
  const pak = await readPak(filePath);
  return {
    ...pak,
    filePath,
    canvas: getCanvasFromPak(pak.files),
  };
};

export {
  buildManifest,
  createPakArchive,
  ensureCanvas,
  getCanvasFromPak,
  prepareAssetFiles,
  readPakArchive,
};
