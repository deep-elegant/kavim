export type PakIndexEntry = {
  path: string;
  start: number;
  length: number;
};

export type PakManifest = {
  name: string;
  savedAt: string;
  version: number;
  [key: string]: unknown;
};

export type PakIndex = {
  version: number;
  manifest: PakManifest;
  entries: PakIndexEntry[];
};

export type PakReadResult = {
  manifest: PakManifest;
  files: Record<string, Buffer>;
  version: number;
  fileCount: number;
};

export type CanvasSnapshot = {
  nodes: unknown[];
  edges: unknown[];
};

export type SavePakRequest = {
  fileName: string;
  directory?: string;
  canvas: CanvasSnapshot;
  assets?: PakAssetInput[];
};

export type PakAssetInput = {
  path: string;
  data: Buffer | ArrayBuffer | Uint8Array | number[] | string;
};

export type PakOperationResult = {
  manifest: PakManifest;
  canvas: CanvasSnapshot;
  filePath: string;
};
