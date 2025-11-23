import fs from "node:fs";
import { createPak } from "./packer";
import type { PakIndexEntry, PakReadResult } from "./types";

type DecodedIndex = {
  manifest: PakReadResult["manifest"];
  entries: PakIndexEntry[];
};

export const decodeJsonIndex = (indexBuffer: Buffer): DecodedIndex | null => {
  try {
    const parsed = JSON.parse(indexBuffer.toString("utf-8")) as {
      manifest?: PakReadResult["manifest"];
      entries?: PakIndexEntry[];
    };
    if (!parsed || !Array.isArray(parsed.entries) || !parsed.manifest) {
      return null;
    }
    return {
      manifest: parsed.manifest,
      entries: parsed.entries,
    };
  } catch {
    return null;
  }
};

export const rewriteJsonIndexPak = async (
  filePath: string,
  manifest: PakReadResult["manifest"],
  files: Record<string, Buffer>,
) => {
  const tempPath = `${filePath}.repack.tmp`;

  const assets = Object.entries(files).map(([path, data]) => ({
    path,
    data,
  }));

  await createPak(tempPath, assets, manifest);
  await fs.promises.rm(filePath, { force: true }); // remove old pak if exists
  await fs.promises.rename(tempPath, filePath);
};
