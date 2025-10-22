import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Node } from '@xyflow/react';

import type { ImageNodeData } from '../nodes/ImageNode';
import type { FileTransfer } from '@/core/canvas/collaboration/manual-webrtc/file-transfer/types';
import type { UsePakAssetsReturn } from '@/core/pak/usePakAssets';

const extractAssetPath = (src?: string | null) => {
  if (!src || typeof src !== 'string') {
    return null;
  }

  return src.startsWith('pak://') ? src.slice('pak://'.length) : src;
};

const defaultErrorMessage = 'Failed to download image asset';

type UseImageAssetTransfersParams = {
  nodes: Node[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  requestAsset: (assetPath: string, displayName?: string) => boolean;
  releaseAssetRequest: (assetPath: string) => void;
  completedTransfers: FileTransfer[];
  failedTransfers: FileTransfer[];
  pakAssets: Pick<UsePakAssetsReturn, 'hasAsset' | 'registerAssetAtPath' | 'isReady'>;
};

const useImageAssetTransfers = ({
  nodes,
  setNodes,
  requestAsset,
  releaseAssetRequest,
  completedTransfers,
  failedTransfers,
  pakAssets,
}: UseImageAssetTransfersParams) => {
  const requestedAssetsRef = useRef<Set<string>>(new Set());
  const processedCompletedRef = useRef<Set<string>>(new Set());
  const processedFailedRef = useRef<Set<string>>(new Set());
  const { hasAsset, registerAssetAtPath, isReady } = pakAssets;

  const setAssetStatus = useCallback(
    (assetPath: string, status: 'downloading' | 'error', errorMessage?: string) => {
      let changed = false;
      setNodes((current) => {
        let mutated = false;
        const next = current.map((node) => {
          if (node.type !== 'image-node') {
            return node;
          }

          const data = node.data as ImageNodeData;
          const nodeAssetPath = extractAssetPath(data.src);
          if (nodeAssetPath !== assetPath) {
            return node;
          }

          const desiredError =
            status === 'error' ? errorMessage ?? defaultErrorMessage : undefined;

          if (data.assetStatus === status && data.assetError === desiredError) {
            if (status !== 'error' && data.assetError !== undefined) {
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

          if (status === 'error') {
            nextData.assetError = desiredError;
          } else if ('assetError' in nextData) {
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

      if (changed) {
        console.info('[ImageAssetTransfers] set asset status', {
          assetPath,
          status,
          errorMessage,
        });
      }
    },
    [setNodes],
  );

  const clearAssetStatus = useCallback(
    (assetPath: string) => {
      let changed = false;
      setNodes((current) => {
        let mutated = false;
        const next = current.map((node) => {
          if (node.type !== 'image-node') {
            return node;
          }

          const data = node.data as ImageNodeData;
          const nodeAssetPath = extractAssetPath(data.src);
          if (nodeAssetPath !== assetPath) {
            return node;
          }

          if (data.assetStatus === undefined && data.assetError === undefined) {
            return node;
          }

          const nextData: ImageNodeData = { ...data };
          delete (nextData as Partial<ImageNodeData>).assetStatus;
          delete (nextData as Partial<ImageNodeData>).assetError;
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

      if (changed) {
        console.info('[ImageAssetTransfers] cleared asset status', {
          assetPath,
        });
      }
    },
    [setNodes],
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const referencedPaths = new Set<string>();

    for (const node of nodes) {
      if (node.type !== 'image-node') {
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
        clearAssetStatus(assetPath);
        continue;
      }

      const displayName =
        data.fileName ?? data.alt ?? assetPath.split('/').pop() ?? 'image asset';

      const requested = requestAsset(assetPath, displayName);
      if (requested) {
        requestedAssetsRef.current.add(assetPath);
        setAssetStatus(assetPath, 'downloading');
        console.info('[ImageAssetTransfers] requested remote asset', {
          assetPath,
          displayName,
        });
      } else if (!requestedAssetsRef.current.has(assetPath)) {
        console.warn('[ImageAssetTransfers] failed to request remote asset', {
          assetPath,
          displayName,
        });
        setAssetStatus(assetPath, 'error');
      }
    }

    Array.from(requestedAssetsRef.current).forEach((assetPath) => {
      if (referencedPaths.has(assetPath)) {
        return;
      }

      requestedAssetsRef.current.delete(assetPath);
      releaseAssetRequest(assetPath);
      clearAssetStatus(assetPath);
      console.info('[ImageAssetTransfers] released unreferenced asset', {
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
    setAssetStatus,
  ]);

  useEffect(() => {
    if (!completedTransfers.length) {
      return;
    }

    completedTransfers.forEach((transfer) => {
      if (
        transfer.direction !== 'incoming' ||
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
          console.info('[ImageAssetTransfers] registering incoming asset', {
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
          clearAssetStatus(assetPath);
          console.info('[ImageAssetTransfers] asset registration complete', {
            transferId: transfer.id,
            assetPath,
          });
        } catch (error) {
          console.error('Failed to register incoming asset', {
            assetPath,
            transferId: transfer.id,
            error,
          });
          requestedAssetsRef.current.delete(assetPath);
          releaseAssetRequest(assetPath);
          setAssetStatus(
            assetPath,
            'error',
            error instanceof Error ? error.message : defaultErrorMessage,
          );
        }
      })();
    });
  }, [
    completedTransfers,
    registerAssetAtPath,
    clearAssetStatus,
    releaseAssetRequest,
    setAssetStatus,
  ]);

  useEffect(() => {
    if (!failedTransfers.length) {
      return;
    }

    failedTransfers.forEach((transfer) => {
      if (
        transfer.direction !== 'incoming' ||
        !transfer.assetPath ||
        processedFailedRef.current.has(transfer.id)
      ) {
        return;
      }

      processedFailedRef.current.add(transfer.id);
      requestedAssetsRef.current.delete(transfer.assetPath);
      releaseAssetRequest(transfer.assetPath);
      console.error('[ImageAssetTransfers] transfer failed', {
        assetPath: transfer.assetPath,
        transferId: transfer.id,
        error: transfer.error,
      });
      setAssetStatus(
        transfer.assetPath,
        'error',
        transfer.error ?? defaultErrorMessage,
      );
    });
  }, [failedTransfers, releaseAssetRequest, setAssetStatus]);
};

export default useImageAssetTransfers;
