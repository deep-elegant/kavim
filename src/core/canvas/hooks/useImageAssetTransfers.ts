import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Node } from "@xyflow/react";

import type { ImageNodeData } from "../nodes/ImageNode";
import type { FileTransfer } from "@/core/canvas/collaboration/manual-webrtc/file-transfer/types";
import type { UsePakAssetsReturn } from "@/core/pak/usePakAssets";

const extractAssetPath = (src?: string | null) => {
  if (!src || typeof src !== "string") {
    return null;
  }

  return src.startsWith("pak://") ? src.slice("pak://".length) : src;
};

const defaultErrorMessage = "Failed to download image asset";

type ConcreteAssetStatus = Exclude<ImageNodeData["assetStatus"], undefined>;

type UseImageAssetTransfersParams = {
  nodes: Node[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  requestAsset: (assetPath: string, displayName?: string) => boolean;
  releaseAssetRequest: (assetPath: string) => void;
  activeTransfers: FileTransfer[];
  completedTransfers: FileTransfer[];
  failedTransfers: FileTransfer[];
  pendingRequestedAssets: Set<string>;
  notifyAssetReady?: (assetPath: string) => void | Promise<void>;
  pakAssets: Pick<
    UsePakAssetsReturn,
    "hasAsset" | "registerAssetAtPath" | "isReady" | "refreshAssets"
  >;
};

const useImageAssetTransfers = ({
  nodes,
  setNodes,
  requestAsset,
  releaseAssetRequest,
  activeTransfers,
  completedTransfers,
  failedTransfers,
  pendingRequestedAssets,
  notifyAssetReady,
  pakAssets,
}: UseImageAssetTransfersParams) => {
  const requestedAssetsRef = useRef<Set<string>>(new Set());
  const processedCompletedRef = useRef<Set<string>>(new Set());
  const processedFailedRef = useRef<Set<string>>(new Set());
  const pendingLocalAssetsRef = useRef<Set<string>>(new Set());
  const pendingRemoteAssetsRef = useRef<Set<string>>(new Set());
  const readyNotifiedRef = useRef<Set<string>>(new Set());
  const { hasAsset, registerAssetAtPath, isReady, refreshAssets } = pakAssets;

  const updateAssetStatus = useCallback(
    (
      assetPath: string,
      status: ConcreteAssetStatus | null,
      errorMessage?: string,
    ) => {
      let changed = false;
      setNodes((current) => {
        let mutated = false;
        const next = current.map((node) => {
          if (node.type !== "image-node") {
            return node;
          }

          const data = node.data as ImageNodeData;
          const nodeAssetPath = extractAssetPath(data.src);
          if (nodeAssetPath !== assetPath) {
            return node;
          }

          if (status === null) {
            if (data.assetStatus === undefined && data.assetError === undefined) {
              return node;
            }

            const nextData: ImageNodeData = { ...data };
            delete (nextData as Partial<ImageNodeData>).assetStatus;
            delete (nextData as Partial<ImageNodeData>).assetError;
            delete (nextData as Partial<ImageNodeData>).assetOrigin;
            mutated = true;

            return {
              ...node,
              data: nextData,
            };
          }

          const desiredError =
            status === "error"
              ? errorMessage ?? defaultErrorMessage
              : undefined;

          if (data.assetStatus === status && data.assetError === desiredError) {
            if (status !== "error" && data.assetError !== undefined) {
              const nextData: ImageNodeData = { ...data };
              delete (nextData as Partial<ImageNodeData>).assetError;
              mutated = true;
              return {
                ...node,
                data: nextData,
              };
            }

            return node;
          }

          const nextData: ImageNodeData = {
            ...data,
            assetStatus: status,
          };

          if (status === "error") {
            nextData.assetError = desiredError;
          } else if ("assetError" in nextData) {
            delete (nextData as Partial<ImageNodeData>).assetError;
          }

          mutated = true;
          return {
            ...node,
            data: nextData,
          };
        });

        if (mutated) {
          changed = true;
          return next;
        }

        return current;
      });

      if (!changed) {
        return;
      }

      if (status === null) {
        console.info("[ImageAssetTransfers] cleared asset status", {
          assetPath,
        });
        return;
      }

      console.info("[ImageAssetTransfers] set asset status", {
        assetPath,
        status,
        errorMessage,
      });
    },
    [setNodes],
  );

  const setAssetStatus = useCallback(
    (
      assetPath: string,
      status: ConcreteAssetStatus,
      errorMessage?: string,
    ) => {
      updateAssetStatus(assetPath, status, errorMessage);
      if (status !== "ready") {
        readyNotifiedRef.current.delete(assetPath);
      }
    },
    [updateAssetStatus],
  );

  const clearAssetStatus = useCallback(
    (assetPath: string) => {
      updateAssetStatus(assetPath, null);
      readyNotifiedRef.current.delete(assetPath);
    },
    [updateAssetStatus],
  );

  const setAssetOrigin = useCallback(
    (assetPath: string, origin?: ImageNodeData["assetOrigin"]) => {
      setNodes((current) => {
        let mutated = false;
        const next = current.map((node) => {
          if (node.type !== "image-node") {
            return node;
          }

          const data = node.data as ImageNodeData;
          const nodeAssetPath = extractAssetPath(data.src);
          if (nodeAssetPath !== assetPath) {
            return node;
          }

          if (origin === undefined) {
            if (data.assetOrigin === undefined) {
              return node;
            }

            const nextData: ImageNodeData = { ...data };
            delete (nextData as Partial<ImageNodeData>).assetOrigin;
            mutated = true;
            return {
              ...node,
              data: nextData,
            };
          }

          if (data.assetOrigin === origin) {
            return node;
          }

          const nextData: ImageNodeData = {
            ...data,
            assetOrigin: origin,
          };
          mutated = true;
          return {
            ...node,
            data: nextData,
          };
        });

        return mutated ? next : current;
      });
    },
    [setNodes],
  );

  const queueRemoteRequest = useCallback(
    (assetPath: string, displayName: string) => {
      pendingLocalAssetsRef.current.delete(assetPath);
      if (requestedAssetsRef.current.has(assetPath)) {
        return;
      }

      const requested = requestAsset(assetPath, displayName);
      if (requested) {
        requestedAssetsRef.current.add(assetPath);
        setAssetStatus(assetPath, "downloading");
        setAssetOrigin(assetPath, "remote");
        console.info("[ImageAssetTransfers] requested remote asset", {
          assetPath,
          displayName,
        });
        return;
      }

      console.warn("[ImageAssetTransfers] failed to request remote asset", {
        assetPath,
        displayName,
      });
      setAssetStatus(assetPath, "error");
    },
    [requestAsset, setAssetStatus, setAssetOrigin],
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const referencedPaths = new Set<string>();
    const generatingAssets: Array<{ assetPath: string; displayName: string }> = [];

    for (const node of nodes) {
      if (node.type !== "image-node") {
        continue;
      }

      const data = node.data as ImageNodeData;
      const assetPath = extractAssetPath(data.src);
      if (!assetPath || referencedPaths.has(assetPath)) {
        continue;
      }

      referencedPaths.add(assetPath);

        if (hasAsset(assetPath)) {
          requestedAssetsRef.current.delete(assetPath);
          pendingLocalAssetsRef.current.delete(assetPath);
          releaseAssetRequest(assetPath);
          setAssetStatus(assetPath, "ready");
          if (!readyNotifiedRef.current.has(assetPath)) {
            readyNotifiedRef.current.add(assetPath);
            void notifyAssetReady?.(assetPath);
          }
          continue;
        }

      const displayName =
        data.fileName ??
        data.alt ??
        assetPath.split("/").pop() ??
        "image asset";

      if (data.assetStatus === "generating") {
        generatingAssets.push({ assetPath, displayName });
        continue;
      }

      queueRemoteRequest(assetPath, displayName);
    }

    Array.from(requestedAssetsRef.current).forEach((assetPath) => {
      if (referencedPaths.has(assetPath)) {
        return;
      }

      requestedAssetsRef.current.delete(assetPath);
      pendingLocalAssetsRef.current.delete(assetPath);
      releaseAssetRequest(assetPath);
      clearAssetStatus(assetPath);
      console.info("[ImageAssetTransfers] released unreferenced asset", {
        assetPath,
      });
    });
 
    generatingAssets.forEach(({ assetPath, displayName }) => {
      if (pendingLocalAssetsRef.current.has(assetPath)) {
        return;
      }

      pendingLocalAssetsRef.current.add(assetPath);

      void (async () => {
        try {
          await refreshAssets();
        } catch (error) {
          console.error("[ImageAssetTransfers] failed to refresh pak assets", {
            assetPath,
            error,
          });
        }

        if (hasAsset(assetPath)) {
          requestedAssetsRef.current.delete(assetPath);
          pendingLocalAssetsRef.current.delete(assetPath);
          releaseAssetRequest(assetPath);
          setAssetStatus(assetPath, "ready");
          if (!readyNotifiedRef.current.has(assetPath)) {
            readyNotifiedRef.current.add(assetPath);
            void notifyAssetReady?.(assetPath);
          }
          return;
        }

        pendingLocalAssetsRef.current.delete(assetPath);

        queueRemoteRequest(assetPath, displayName);
      })();
    });
  }, [
    nodes,
    isReady,
    hasAsset,
    refreshAssets,
    queueRemoteRequest,
    releaseAssetRequest,
    clearAssetStatus,
    setAssetStatus,
    setAssetOrigin,
    notifyAssetReady,
  ]);

  useEffect(() => {
    const current = pendingRequestedAssets
      ? new Set(pendingRequestedAssets)
      : new Set<string>();

    current.forEach((assetPath) => {
      if (!pendingRemoteAssetsRef.current.has(assetPath)) {
        setAssetStatus(assetPath, "generating");
        setAssetOrigin(assetPath, "remote");
      }
    });

    pendingRemoteAssetsRef.current.forEach((assetPath) => {
      if (current.has(assetPath)) {
        return;
      }

      if (!hasAsset(assetPath) && requestedAssetsRef.current.has(assetPath)) {
        setAssetStatus(assetPath, "downloading");
        setAssetOrigin(assetPath, "remote");
      }
    });

    pendingRemoteAssetsRef.current = current;
  }, [
    pendingRequestedAssets,
    hasAsset,
    setAssetStatus,
    setAssetOrigin,
  ]);

  useEffect(() => {
    if (!completedTransfers.length) {
      return;
    }

    completedTransfers.forEach((transfer) => {
      if (
        transfer.direction !== "incoming" ||
        !transfer.assetPath ||
        !transfer.payload ||
        processedCompletedRef.current.has(transfer.id)
      ) {
        return;
      }

      processedCompletedRef.current.add(transfer.id);
      const assetPath = transfer.assetPath;
      const blob = transfer.payload;

      void (async () => {
        try {
          console.info("[ImageAssetTransfers] registering incoming asset", {
            transferId: transfer.id,
            assetPath,
            name: transfer.name,
            mimeType: transfer.mimeType,
            size: transfer.size,
          });
          const buffer = await blob.arrayBuffer();
          await registerAssetAtPath(assetPath, buffer, {
            fileName: transfer.name,
            mimeType: transfer.mimeType,
          });
          requestedAssetsRef.current.delete(assetPath);
          pendingLocalAssetsRef.current.delete(assetPath);
          releaseAssetRequest(assetPath);
          setAssetStatus(assetPath, "ready");
          if (!readyNotifiedRef.current.has(assetPath)) {
            readyNotifiedRef.current.add(assetPath);
            void notifyAssetReady?.(assetPath);
          }
          console.info("[ImageAssetTransfers] asset registration complete", {
            transferId: transfer.id,
            assetPath,
          });
        } catch (error) {
          console.error("Failed to register incoming asset", {
            assetPath,
            transferId: transfer.id,
            error,
          });
          requestedAssetsRef.current.delete(assetPath);
          pendingLocalAssetsRef.current.delete(assetPath);
          releaseAssetRequest(assetPath);
          setAssetStatus(
            assetPath,
            "error",
            error instanceof Error ? error.message : defaultErrorMessage,
          );
        }
      })();
    });
  }, [
    completedTransfers,
    registerAssetAtPath,
    releaseAssetRequest,
    setAssetStatus,
  ]);

  useEffect(() => {
    if (!failedTransfers.length) {
      return;
    }

    failedTransfers.forEach((transfer) => {
      if (
        transfer.direction !== "incoming" ||
        !transfer.assetPath ||
        processedFailedRef.current.has(transfer.id)
      ) {
        return;
      }

      processedFailedRef.current.add(transfer.id);
      requestedAssetsRef.current.delete(transfer.assetPath);
      pendingLocalAssetsRef.current.delete(transfer.assetPath);
      releaseAssetRequest(transfer.assetPath);
      console.error("[ImageAssetTransfers] transfer failed", {
        assetPath: transfer.assetPath,
        transferId: transfer.id,
        error: transfer.error,
      });
      setAssetStatus(
        transfer.assetPath,
        "error",
        transfer.error ?? defaultErrorMessage,
      );
    });
  }, [failedTransfers, releaseAssetRequest, setAssetStatus]);

  useEffect(() => {
    activeTransfers.forEach((transfer) => {
      if (
        transfer.direction !== "incoming" ||
        !transfer.assetPath ||
        (transfer.status !== "pending" && transfer.status !== "in-progress")
      ) {
        return;
      }

      setAssetStatus(transfer.assetPath, "downloading");
      setAssetOrigin(transfer.assetPath, "remote");
    });
  }, [activeTransfers, setAssetOrigin, setAssetStatus]);
};

export default useImageAssetTransfers;
