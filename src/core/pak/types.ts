/**
 * Type definitions for .pak archive format.
 * - Pak files store canvas state + binary assets in a custom binary format.
 * - Used for saving/loading projects with embedded images.
 */

/** File location metadata stored in pak index */
export type PakIndexEntry = {
  path: string;
  start: number; // Byte offset in pak file
  length: number; // File size in bytes
};

/** Project metadata stored in pak */
export type PakManifest = {
  name: string;
  savedAt: string; // ISO timestamp
  version: number;
  [key: string]: unknown; // Allow custom metadata
};

/** Internal index structure (serialized with MessagePack) */
export type PakIndex = {
  version: number;
  manifest: PakManifest;
  entries: PakIndexEntry[];
};

/** Result of reading a pak file */
export type PakReadResult = {
  manifest: PakManifest;
  files: Record<string, Buffer>; // Keyed by file path
  version: number;
  fileCount: number;
};

/** Canvas state snapshot (nodes + edges from React Flow) */
export type CanvasSnapshot = {
  nodes: unknown[];
  edges: unknown[];
};

/** Request payload for saving pak via IPC */
export type SavePakRequest = {
  fileName: string;
  directory?: string;
  canvas: CanvasSnapshot;
  assets?: PakAssetInput[]; // Additional files to bundle
};

/** Asset input (accepts various binary formats for flexibility) */
export type PakAssetInput = {
  path: string;
  data: Buffer | ArrayBuffer | Uint8Array | number[] | string;
};

/** Result of pak save/load operation */
export type PakOperationResult = {
  manifest: PakManifest;
  canvas: CanvasSnapshot;
  filePath: string;
};
