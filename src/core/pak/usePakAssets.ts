import { useCallback, useEffect, useRef, useState } from "react";
import { Buffer } from "buffer";

import {
  buildPakUri,
  ensureAssetFileMetadata,
  reserveAssetPath,
} from "./assetPaths";

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
  mimeType?: string;
};

const toUint8Array = (input: ArrayBuffer | Uint8Array) =>
  input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input);

const base64ToUint8Array = (base64: string) =>
  new Uint8Array(Buffer.from(base64, "base64"));

export const usePakAssets = () => {
  const usedPathsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const initializePromiseRef = useRef<Promise<void> | null>(null);
  const [isReady, setIsReady] = useState(initializedRef.current);

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
      console.error("Failed to list pak assets", error);
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
    let cancelled = false;

    void ensureInitialized()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ensureInitialized]);

  const registerAssetFromBytes = useCallback(
    async (
      input: ArrayBuffer | Uint8Array,
      options?: RegisterBytesOptions,
    ): Promise<PakAssetRegistration> => {
      await ensureInitialized();

      const bytes = toUint8Array(input);
      const extensionHint =
        options?.extension ?? options?.mimeType?.split("/")?.[1];
      const { assetFileName, displayFileName } = ensureAssetFileMetadata(
        options?.fileName,
        extensionHint,
      );
      const reservedPath = reserveAssetPath(
        usedPathsRef.current,
        assetFileName,
      );

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
    [ensureInitialized],
  );

  const registerAssetFromFilePath = useCallback(
    async (filePath: string) => {
      const dataUrl = await window.fileSystem.readFileAsDataUrl(filePath);
      const [, base64] = dataUrl.split(",");
      if (!base64) {
        throw new Error("Unable to decode selected file.");
      }
      const bytes = base64ToUint8Array(base64);
      return registerAssetFromBytes(bytes, { fileName: filePath });
    },
    [registerAssetFromBytes],
  );

  const registerAssetFromFile = useCallback(
    async (file: File) => {
      const arrayBuffer = await file.arrayBuffer();
      const extensionHint = file.type.startsWith("image/")
        ? file.type.split("/")[1]
        : undefined;
      return registerAssetFromBytes(arrayBuffer, {
        fileName: file.name,
        extension: extensionHint,
        mimeType: file.type,
      });
    },
    [registerAssetFromBytes],
  );

  const registerAssetAtPath = useCallback(
    async (
      path: string,
      input: ArrayBuffer | Uint8Array,
      options?: RegisterBytesOptions,
    ) => {
      await ensureInitialized();

      const bytes = toUint8Array(input);
      const extensionHint =
        options?.extension ?? options?.mimeType?.split("/")?.[1];
      const { displayFileName } = ensureFileMetadata(
        options?.fileName,
        extensionHint,
      );

      await window.projectPak.addAsset({ path, data: bytes });
      usedPathsRef.current.add(path);

      const registration: PakAssetRegistration = {
        path,
        fileName: displayFileName,
        uri: buildPakUri(path),
      };

      return registration;
    },
    [ensureInitialized],
  );

  const hasAsset = useCallback(
    (path: string) => usedPathsRef.current.has(path),
    [],
  );

  return {
    registerAssetFromBytes,
    registerAssetFromFile,
    registerAssetFromFilePath,
    registerAssetAtPath,
    hasAsset,
    isReady,
    refreshAssets: refreshFromActivePak,
  };
};

export type UsePakAssetsReturn = ReturnType<typeof usePakAssets>;
