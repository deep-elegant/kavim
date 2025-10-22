const mimeTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};

const extractExtension = (assetPath: string) => {
  const lastDotIndex = assetPath.lastIndexOf(".");
  if (lastDotIndex < 0) {
    return "";
  }

  return assetPath.slice(lastDotIndex).toLowerCase();
};

export const guessMimeType = (assetPath: string) => {
  const extension = extractExtension(assetPath);
  return mimeTypes[extension] ?? "application/octet-stream";
};

export default guessMimeType;
