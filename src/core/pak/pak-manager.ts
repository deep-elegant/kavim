import { protocol } from "electron";
import path from "node:path";
import type { PakReadResult } from "./types";

let isRegistered = false;
let activePak: (PakReadResult & { filePath: string }) | null = null;

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

const normalizeRequestPath = (url: string) => {
  const withoutProtocol = url.replace(/^pak:\/\//i, "");
  const decoded = decodeURIComponent(withoutProtocol);
  return decoded.replace(/^\/+/, "");
};

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

    respond({
      data: buffer,
      mimeType: guessMimeType(requestPath),
    });
  });

  isRegistered = true;
};

export const setActivePak = (pak: (PakReadResult & { filePath: string }) | null) => {
  activePak = pak;
};

export const getActivePak = () => activePak;
