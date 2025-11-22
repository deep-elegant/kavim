import fs from "node:fs";
import { unpack } from "./msgpack";
import { decodeJsonIndex, rewriteJsonIndexPak } from "./json-to-msgpack";
import type { PakIndexEntry, PakReadResult } from "./types";

/**
 * Reads .pak archives created by packer.ts.
 * - Parses header to locate index, then loads all files into memory.
 * - Returns manifest metadata and file contents keyed by path.
 */

const HEADER_SIZE = 12;

/**
 * Loads .pak file from disk and extracts all contents.
 * - Reads header to find index location, deserializes index, then reads all files.
 */
export const readPak = async (filePath: string): Promise<PakReadResult> => {
  const fd = await fs.promises.open(filePath, "r");

  try {
    let legacyJsonIndex = false;

    // Read header to get metadata pointers
    const header = Buffer.alloc(HEADER_SIZE);
    await fd.read(header, 0, HEADER_SIZE, 0);

    const version = header.readUInt32LE(0);
    const fileCount = header.readUInt32LE(4);
    const indexOffset = header.readUInt32LE(8);

    // Read and deserialize index from end of file
    const stats = await fd.stat();
    const indexLength = stats.size - indexOffset;
    const indexBuffer = Buffer.alloc(indexLength);
    await fd.read(indexBuffer, 0, indexLength, indexOffset);

    let decodedIndex: { manifest: PakReadResult["manifest"]; entries: PakIndexEntry[] };

    try {
      decodedIndex = unpack(indexBuffer) as {
        manifest: PakReadResult["manifest"];
        entries: PakIndexEntry[];
      };
    } catch (error) {
      const jsonIndex = decodeJsonIndex(indexBuffer);
      if (!jsonIndex) {
        throw error;
      }
      decodedIndex = jsonIndex;
      legacyJsonIndex = true;
    }

    // Load each file using offsets from index
    const files: Record<string, Buffer> = {};
    for (const entry of decodedIndex.entries) {
      const buffer = Buffer.alloc(entry.length);
      await fd.read(buffer, 0, entry.length, entry.start);
      files[entry.path] = buffer;
    }

    await fd.close();

    if (legacyJsonIndex) {
      await rewriteJsonIndexPak(filePath, decodedIndex.manifest, files);
    }

    return {
      manifest: decodedIndex.manifest,
      files,
      version,
      fileCount,
    };
  } finally {
    await fd.close();
  }
};
