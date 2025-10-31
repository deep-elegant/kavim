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
  pakAssets: Pick<
    UsePakAssetsReturn,
    "hasAsset" | "registerAssetAtPath" | "isReady" | "refreshAssets"
  >;
  isCollaborationActive?: boolean;
};

const useImageAssetTransfers = ({
  nodes,
  setNodes,
  requestAsset,
  releaseAssetRequest,
  activeTransfers,
  completedTransfers,
  failedTransfers,
  pakAssets,
  isCollaborationActive = false,
}: UseImageAssetTransfersParams) => {
  const requestedAssetsRef = useRef<Set<string>>(new Set());
  const processedCompletedRef = useRef<Set<string>>(new Set());
  const processedFailedRef = useRef<Set<string>>(new Set());
  const pendingRefreshChecksRef = useRef<Set<string>>(new Set());
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
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
    },
    [updateAssetStatus],
  );

  const clearAssetStatus = useCallback(
    (assetPath: string) => {
      updateAssetStatus(assetPath, null);
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

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const referencedPaths = new Set<string>();

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
        pendingRefreshChecksRef.current.delete(assetPath);
        requestedAssetsRef.current.delete(assetPath);
        releaseAssetRequest(assetPath);
        setAssetStatus(assetPath, "ready");
        setAssetOrigin(assetPath, data.assetOrigin ?? "local");
        continue;
      }

      if (
        requestedAssetsRef.current.has(assetPath) ||
        pendingRefreshChecksRef.current.has(assetPath)
      ) {
        continue;
      }

      const displayName =
        data.fileName ??
        data.alt ??
        assetPath.split("/").pop() ??
        "image asset";

      pendingRefreshChecksRef.current.add(assetPath);

      const ensureAssetAvailable = async () => {
        if (!refreshPromiseRef.current) {
          refreshPromiseRef.current = refreshAssets()
            .catch((error) => {
              console.error("[ImageAssetTransfers] failed to refresh pak", error);
              throw error;
            })
            .finally(() => {
              refreshPromiseRef.current = null;
            });
        }

        try {
          await refreshPromiseRef.current;
        } catch {
          // Error already logged; continue to attempt remote request when applicable.
        }

        if (hasAsset(assetPath)) {
          pendingRefreshChecksRef.current.delete(assetPath);
          requestedAssetsRef.current.delete(assetPath);
          releaseAssetRequest(assetPath);
          setAssetStatus(assetPath, "ready");
          setAssetOrigin(assetPath, data.assetOrigin ?? "local");
          return;
        }

        if (!isCollaborationActive) {
          pendingRefreshChecksRef.current.delete(assetPath);
          setAssetOrigin(assetPath);
          setAssetStatus(assetPath, "error");
          return;
        }

        const requested = requestAsset(assetPath, displayName);
        if (requested) {
          requestedAssetsRef.current.add(assetPath);
          setAssetStatus(assetPath, "downloading");
          setAssetOrigin(assetPath, "remote");
        } else {
          setAssetStatus(assetPath, "error");
          setAssetOrigin(assetPath);
        }

        pendingRefreshChecksRef.current.delete(assetPath);
      };

      void ensureAssetAvailable().catch((error) => {
        pendingRefreshChecksRef.current.delete(assetPath);
        console.error("[ImageAssetTransfers] failed to ensure asset", {
          assetPath,
          error,
        });
      });
    }

    requestedAssetsRef.current.forEach((assetPath) => {
      if (referencedPaths.has(assetPath)) {
        return;
      }

      requestedAssetsRef.current.delete(assetPath);
      pendingRefreshChecksRef.current.delete(assetPath);
      releaseAssetRequest(assetPath);
      clearAssetStatus(assetPath);
      console.info("[ImageAssetTransfers] released unreferenced asset", {
        assetPath,
      });
    });
  }, [
    nodes,
    isReady,
    hasAsset,
    requestAsset,
    releaseAssetRequest,
    clearAssetStatus,
    setAssetOrigin,
    setAssetStatus,
    refreshAssets,
    isCollaborationActive,
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
          releaseAssetRequest(assetPath);
          setAssetStatus(assetPath, "ready");
          setAssetOrigin(assetPath, "remote");
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
    setAssetOrigin,
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
