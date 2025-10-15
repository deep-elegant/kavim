import fs from "node:fs";
import path from "node:path";
import { pack } from "./msgpack";
import type { PakAssetInput, PakIndexEntry, PakManifest } from "./types";

type PakFileDescriptor = {
  path: string;
  data: Buffer;
};

const HEADER_SIZE = 12; // 3 uint32 values

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

const sanitizeAssetPath = (assetPath: string) => {
  const normalized = assetPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) {
    throw new Error(`Invalid asset path: ${assetPath}`);
  }
  return normalized;
};

const sanitizeFileName = (fileName: string) => {
  const trimmed = fileName.trim();
  const withoutSeparators = trimmed.replace(/[\\/]/g, "_");
  const withExtension = withoutSeparators.endsWith(".pak")
    ? withoutSeparators
    : `${withoutSeparators}.pak`;
  return withExtension;
};

export const resolveOutputPath = (
  baseDirectory: string,
  fileName: string,
  directory?: string,
) => {
  const sanitizedFileName = sanitizeFileName(fileName);
  if (!directory) {
    return path.join(baseDirectory, sanitizedFileName);
  }

  const trimmed = directory.trim();
  if (!trimmed) {
    return path.join(baseDirectory, sanitizedFileName);
  }

  const withoutTrailingSeparators = trimmed.replace(/[\\/]+$/, "");
  const targetDirectory = path.isAbsolute(withoutTrailingSeparators)
    ? withoutTrailingSeparators
    : path.join(baseDirectory, withoutTrailingSeparators);
  return path.join(targetDirectory, sanitizedFileName);
};

export const createPak = async (
  outputPath: string,
  files: PakAssetInput[],
  manifest: PakManifest,
) => {
  const fd = await fs.promises.open(outputPath, "w");

  try {
    const headerSize = HEADER_SIZE;
    const indexEntries: PakIndexEntry[] = [];
    let currentOffset = headerSize;

    const normalizedFiles: PakFileDescriptor[] = files.map(({ path: filePath, data }) => ({
      path: sanitizeAssetPath(filePath),
      data: toBuffer(data),
    }));

    for (const file of normalizedFiles) {
      const { path: assetPath, data } = file;
      const length = data.length;
      await fd.write(data, 0, length, currentOffset);
      indexEntries.push({ path: assetPath, start: currentOffset, length });
      currentOffset += length;
    }

    const indexBuffer = pack({
      version: 1,
      manifest,
      entries: indexEntries,
    });

    const indexOffset = currentOffset;
    await fd.write(indexBuffer, 0, indexBuffer.length, currentOffset);
    currentOffset += indexBuffer.length;

    const header = Buffer.alloc(headerSize);
    header.writeUInt32LE(1, 0);
    header.writeUInt32LE(indexEntries.length, 4);
    header.writeUInt32LE(indexOffset, 8);
    await fd.write(header, 0, header.length, 0);
  } finally {
    await fd.close();
  }
};
