import path from "node:path";
import type { Node } from "@xyflow/react";
import type { CanvasSnapshot, PakAssetInput, PakManifest } from "./types";
import { createPak } from "./packer";
import { readPak } from "./unpacker";
import { ImageNodeType } from "@/core/canvas/nodes/ImageNode";

/**
 * High-level utilities for pak operations (save/load canvas with assets).
 * - Converts base64 image data to binary assets stored in pak.
 * - Rewrites image node URLs from data: to pak:// for loaded files.
 * - Manages asset lifecycle (only keep assets referenced by canvas).
 */

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

/** Validate canvas structure to prevent crashes on malformed data */
const ensureCanvas = (canvas: CanvasSnapshot): CanvasSnapshot => {
  const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
  const edges = Array.isArray(canvas.edges) ? canvas.edges : [];
  return { nodes, edges };
};

/** Extract canvas JSON from pak files, returning empty canvas on parse failure */
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

/** Generate manifest metadata using filename and current timestamp */
const buildManifest = (
  filePath: string,
  extras?: Partial<PakManifest>,
): PakManifest => {
  const fileName = path.parse(filePath).name;
  return {
    name: fileName,
    savedAt: new Date().toISOString(),
    version: 1,
    ...extras,
  };
};

/**
 * Prepares all files for pak archive (canvas, manifest, assets).
 * - Converts base64 image nodes to binary assets with pak:// URLs.
 * - Prunes unused assets from previous saves to keep pak size minimal.
 * - Returns array of all files ready for packer.
 */
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

  // Extract embedded base64 images from canvas and store as binary assets
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

      // Generate unique filename to avoid collisions
      const uniqueFileName = fileName
        ? `${path.parse(fileName).name}-${imageCounter}.${extension}`
        : `image-${imageCounter}.${extension}`;
      const assetPath = `assets/${uniqueFileName}`;
      imageCounter++;

      processedAssets.push({ path: assetPath, data: buffer });

      // Rewrite node to use pak:// URL instead of data:
      node.data.src = `pak://${assetPath}`;
    }
  }

  // Prune assets not referenced by any canvas node (removed images)
  const usedCanvasAssetPaths = (canvas.nodes as Node[])
    .filter((node) => node.type === "image-node")
    .map((node) => (node as ImageNodeType).data.src.split("pak://")[1]);

  // In-place filter to remove unused assets (avoids memory allocation for large files)
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

/**
 * High-level wrapper for creating .pak archives with canvas + assets.
 * - Processes canvas to extract/convert images, then calls low-level packer.
 */
const createPakArchive = async (
  outputPath: string,
  canvas: CanvasSnapshot,
  manifest: PakManifest,
  assets?: PakAssetInput[],
) => {
  const files = prepareAssetFiles(canvas, manifest, assets ?? []);
  await createPak(outputPath, files, manifest);
};

/**
 * High-level wrapper for reading .pak archives.
 * - Loads pak and extracts canvas JSON for immediate use.
 */
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
