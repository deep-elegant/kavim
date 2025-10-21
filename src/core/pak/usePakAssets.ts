import { useCallback, useEffect, useRef } from 'react';
import { Buffer } from 'buffer';

export type PakAssetRegistration = {
  /** Internal pak-relative path (e.g., assets/image.png) */
  path: string;
  /** Display-friendly filename (original when available) */
  fileName: string;
  /** Fully-qualified URI for renderer usage (pak://assets/image.png) */
  uri: string;
};

type RegisterBytesOptions = {
  fileName?: string;
  extension?: string;
};

const DEFAULT_FILE_NAME = 'image';
const DEFAULT_EXTENSION = 'png';

const stripDirectories = (value: string) => {
  const segments = value.split(/[\\/]/);
  return segments[segments.length - 1] ?? value;
};

const sanitizeBaseName = (base: string) =>
  base
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const ensureFileMetadata = (fileName?: string, extensionHint?: string) => {
  const extracted = fileName ? stripDirectories(fileName.trim()) : '';
  const lastDotIndex = extracted.lastIndexOf('.');
  const basePart = lastDotIndex > 0 ? extracted.slice(0, lastDotIndex) : extracted;
  const extensionPart = lastDotIndex > 0 ? extracted.slice(lastDotIndex + 1) : '';
  const extension = (extensionPart || extensionHint || DEFAULT_EXTENSION)
    .replace(/^\./, '')
    .toLowerCase();
  const sanitizedBase = sanitizeBaseName(basePart);
  const base = sanitizedBase || DEFAULT_FILE_NAME;
  const assetFileName = `${base}.${extension}`;
  const displayFileName = extracted || `${DEFAULT_FILE_NAME}.${extension}`;

  return {
    assetFileName,
    base,
    extension,
    displayFileName,
  };
};

const toUint8Array = (input: ArrayBuffer | Uint8Array) =>
  input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input);

const base64ToUint8Array = (base64: string) => new Uint8Array(Buffer.from(base64, 'base64'));

const buildPakUri = (assetPath: string) => `pak://${assetPath}`;

export const usePakAssets = () => {
  const usedPathsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const initializePromiseRef = useRef<Promise<void> | null>(null);

  const refreshFromActivePak = useCallback(async () => {
    if (!window?.projectPak?.listAssets) {
      usedPathsRef.current = new Set();
      initializedRef.current = true;
      return;
    }

    try {
      const assets = await window.projectPak.listAssets();
      usedPathsRef.current = new Set(assets.map((asset) => asset.path));
      initializedRef.current = true;
    } catch (error) {
      console.error('Failed to list pak assets', error);
      usedPathsRef.current = new Set();
      initializedRef.current = true;
    }
  }, []);

  const ensureInitialized = useCallback(async () => {
    if (initializedRef.current) {
      return;
    }

    if (!initializePromiseRef.current) {
      initializePromiseRef.current = refreshFromActivePak().finally(() => {
        initializePromiseRef.current = null;
        initializedRef.current = true;
      });
    }

    await initializePromiseRef.current;
  }, [refreshFromActivePak]);

  useEffect(() => {
    void ensureInitialized();
  }, [ensureInitialized]);

  const reserveAssetPath = useCallback((assetFileName: string) => {
    const usedPaths = usedPathsRef.current;

    const lastDotIndex = assetFileName.lastIndexOf('.');
    const base = lastDotIndex >= 0 ? assetFileName.slice(0, lastDotIndex) : assetFileName;
    const extension = lastDotIndex >= 0 ? assetFileName.slice(lastDotIndex + 1) : DEFAULT_EXTENSION;

    let counter = 0;
    while (true) {
      const suffix = counter === 0 ? '' : `-${counter}`;
      const candidateFileName = `${base}${suffix}.${extension}`;
      const candidatePath = `assets/${candidateFileName}`;
      if (!usedPaths.has(candidatePath)) {
        usedPaths.add(candidatePath);
        return candidatePath;
      }

      counter += 1;
    }
  }, []);

  const registerAssetFromBytes = useCallback(
    async (input: ArrayBuffer | Uint8Array, options?: RegisterBytesOptions): Promise<PakAssetRegistration> => {
      await ensureInitialized();

      const bytes = toUint8Array(input);
      const { assetFileName, displayFileName } = ensureFileMetadata(options?.fileName, options?.extension);
      const reservedPath = reserveAssetPath(assetFileName);

      try {
        await window.projectPak.addAsset({ path: reservedPath, data: bytes });
      } catch (error) {
        // Remove reserved path on failure so we can retry later
        usedPathsRef.current.delete(reservedPath);
        throw error;
      }

      const registration: PakAssetRegistration = {
        path: reservedPath,
        fileName: displayFileName,
        uri: buildPakUri(reservedPath),
      };
      return registration;
    },
    [ensureInitialized, reserveAssetPath],
  );

  const registerAssetFromFilePath = useCallback(
    async (filePath: string) => {
      const dataUrl = await window.fileSystem.readFileAsDataUrl(filePath);
      const [, base64] = dataUrl.split(',');
      if (!base64) {
        throw new Error('Unable to decode selected file.');
      }
      const bytes = base64ToUint8Array(base64);
      return registerAssetFromBytes(bytes, { fileName: filePath });
    },
    [registerAssetFromBytes],
  );

  const registerAssetFromFile = useCallback(
    async (file: File) => {
      const arrayBuffer = await file.arrayBuffer();
      const extensionHint = file.type.startsWith('image/') ? file.type.split('/')[1] : undefined;
      return registerAssetFromBytes(arrayBuffer, {
        fileName: file.name,
        extension: extensionHint,
      });
    },
    [registerAssetFromBytes],
  );

  return {
    registerAssetFromBytes,
    registerAssetFromFile,
    registerAssetFromFilePath,
    refreshAssets: refreshFromActivePak,
  };
};

export type UsePakAssetsReturn = ReturnType<typeof usePakAssets>;
