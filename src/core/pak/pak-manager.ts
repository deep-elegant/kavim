import { protocol } from "electron";
import path from "node:path";
import type { PakAssetInput, PakReadResult } from "./types";

/**
 * Manages custom pak:// protocol for loading assets from .pak archives.
 * - Registers Electron protocol handler to serve files from in-memory pak.
 * - Allows rendering `pak://assets/image.png` URLs directly in the canvas.
 */

let isRegistered = false;
let activePak: (PakReadResult & { filePath: string }) | null = null;

const createEmptyPak = (): PakReadResult & { filePath: string } => ({
  manifest: {
    name: "untitled",
    savedAt: new Date().toISOString(),
    version: 1,
  },
  files: {},
  version: 1,
  fileCount: 0,
  filePath: "",
});

// Map file extensions to MIME types for proper browser rendering
const mimeTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};

const guessMimeType = (assetPath: string) => {
  const extension = path.extname(assetPath).toLowerCase();
  return mimeTypes[extension] ?? "application/octet-stream";
};

export const toBuffer = (data: PakAssetInput["data"]): Buffer => {
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

/** Strip protocol and decode URL to get internal pak file path */
const normalizeRequestPath = (url: string) => {
  const withoutProtocol = url.replace(/^pak:\/\//i, "");
  const decoded = decodeURIComponent(withoutProtocol);
  return decoded.replace(/^\/+/, "");
};

/**
 * Registers pak:// protocol handler with Electron.
 * - Should be called once during app initialization.
 * - Allows loading assets via pak:// URLs in renderer process.
 */
export const registerPakProtocol = () => {
  if (isRegistered) {
    return;
  }

  protocol.registerBufferProtocol("pak", (request, respond) => {
    if (!activePak) {
      respond({ statusCode: 404 });
      return;
    }

    const requestPath = normalizeRequestPath(request.url);
    const buffer = activePak.files[requestPath];
    if (!buffer) {
      respond({ statusCode: 404 });
      return;
    }

    // Serve file with correct MIME type for browser rendering
    respond({
      data: buffer,
      mimeType: guessMimeType(requestPath),
    });
  });

  isRegistered = true;
};

/**
 * Sets the currently active .pak archive for protocol handler.
 * - Only one pak can be active at a time (matches opened file).
 * - Set to null to clear (no file open).
 */
export const setActivePak = (pak: (PakReadResult & { filePath: string }) | null) => {
  activePak = pak;
};

export const getActivePak = () => activePak;

export const ensureActivePak = () => {
  if (!activePak) {
    activePak = createEmptyPak();
  }
  return activePak;
};

export const upsertPakAsset = (asset: PakAssetInput) => {
  const pak = ensureActivePak();
  const buffer = toBuffer(asset.data);
  pak.files[asset.path] = buffer;
  pak.fileCount = Object.keys(pak.files).length;
  return buffer;
};

export const removePakAsset = (assetPath: string) => {
  const pak = ensureActivePak();
  if (!(assetPath in pak.files)) {
    return false;
  }
  delete pak.files[assetPath];
  pak.fileCount = Object.keys(pak.files).length;
  return true;
};
