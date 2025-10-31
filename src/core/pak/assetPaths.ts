const DEFAULT_FILE_NAME = "image";
const DEFAULT_EXTENSION = "png";
const DEFAULT_DIRECTORY = "assets";

const stripDirectories = (value: string) => {
  const segments = value.split(/[\\/]/);
  return segments[segments.length - 1] ?? value;
};

const sanitizeBaseName = (base: string) =>
  base
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

export const ensureAssetFileMetadata = (
  fileName?: string,
  extensionHint?: string,
) => {
  const extracted = fileName ? stripDirectories(fileName.trim()) : "";
  const lastDotIndex = extracted.lastIndexOf(".");
  const basePart =
    lastDotIndex > 0 ? extracted.slice(0, lastDotIndex) : extracted;
  const extensionPart =
    lastDotIndex > 0 ? extracted.slice(lastDotIndex + 1) : "";

  const extension = (extensionPart || extensionHint || DEFAULT_EXTENSION)
    .replace(/^\./, "")
    .toLowerCase();
  const sanitizedBase = sanitizeBaseName(basePart);
  const base = sanitizedBase || DEFAULT_FILE_NAME;
  const assetFileName = `${base}.${extension}`;
  const displayFileName = extracted || `${DEFAULT_FILE_NAME}.${extension}`;

  return {
    assetFileName,
    displayFileName,
    base,
    extension,
  } as const;
};

export const reserveAssetPath = (
  usedPaths: Set<string>,
  assetFileName: string,
  directory: string = DEFAULT_DIRECTORY,
) => {
  const lastDotIndex = assetFileName.lastIndexOf(".");
  const base =
    lastDotIndex >= 0 ? assetFileName.slice(0, lastDotIndex) : assetFileName;
  const extension =
    lastDotIndex >= 0
      ? assetFileName.slice(lastDotIndex + 1)
      : DEFAULT_EXTENSION;

  let counter = 0;
  while (true) {
    const suffix = counter === 0 ? "" : `-${counter}`;
    const candidateFileName = `${base}${suffix}.${extension}`;
    const candidatePath = `${directory}/${candidateFileName}`;
    if (!usedPaths.has(candidatePath)) {
      usedPaths.add(candidatePath);
      return candidatePath;
    }

    counter += 1;
  }
};

export const buildPakUri = (assetPath: string) => `pak://${assetPath}`;
