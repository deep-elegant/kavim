import fs from "node:fs";
import { unpack } from "./msgpack";
import type { PakReadResult } from "./types";

const HEADER_SIZE = 12;

export const readPak = async (filePath: string): Promise<PakReadResult> => {
  const fd = await fs.promises.open(filePath, "r");

  try {
    const header = Buffer.alloc(HEADER_SIZE);
    await fd.read(header, 0, HEADER_SIZE, 0);

    const version = header.readUInt32LE(0);
    const fileCount = header.readUInt32LE(4);
    const indexOffset = header.readUInt32LE(8);

    const stats = await fd.stat();
    const indexLength = stats.size - indexOffset;
    const indexBuffer = Buffer.alloc(indexLength);
    await fd.read(indexBuffer, 0, indexLength, indexOffset);

    const { manifest, entries } = unpack(indexBuffer) as {
      manifest: PakReadResult["manifest"];
      entries: { path: string; start: number; length: number }[];
    };

    const files: Record<string, Buffer> = {};
    for (const entry of entries) {
      const buffer = Buffer.alloc(entry.length);
      await fd.read(buffer, 0, entry.length, entry.start);
      files[entry.path] = buffer;
    }

    return { manifest, files, version, fileCount };
  } finally {
    await fd.close();
  }
};
