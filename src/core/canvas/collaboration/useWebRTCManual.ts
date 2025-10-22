import { useState, useRef, useCallback, useEffect } from "react";
import * as Y from "yjs";

import { guessMimeType } from "@/core/pak/mimeTypes";

import type {
  ChannelMessage,
  DataChannelState,
  WebRTCChatMessage,
} from "./manual-webrtc/types";
import {
  DATA_CHANNEL_MAX_BUFFER,
  DATA_CHANNEL_RESUME_THRESHOLD,
} from "./manual-webrtc/types";
import {
  FILE_TRANSFER_CHANNEL_LABEL,
  SYNC_CHANNEL_LABEL,
  usePeerConnection,
  usePeerConnectionDataChannel,
} from "./manual-webrtc/usePeerConnection";
import { usePresenceSync } from "./manual-webrtc/usePresenceSync";
import { useYjsSync } from "./manual-webrtc/useYjsSync";
import { useStatsForNerds } from "../../diagnostics/StatsForNerdsContext";
import type { FileRequestMessage } from "./manual-webrtc/file-transfer/types";
import {
  useFileTransferChannel,
  type UseFileTransferChannelResult,
} from "./manual-webrtc/file-transfer/useFileTransferChannel";

export type {
  CollaboratorInteraction,
  CursorPresence,
  WebRTCChatMessage,
} from "./manual-webrtc/types";

const stripPakProtocol = (value: string) =>
  value.startsWith("pak://") ? value.slice("pak://".length) : value;

/**
 * Manual WebRTC hook for peer-to-peer collaboration.
 * - No signaling server: users manually exchange SDP and ICE candidates
 * - Syncs Yjs document updates over WebRTC data channel
 * - Handles presence data (cursors, selections, typing indicators)
 * - Chunks large messages to avoid WebRTC size limits
 */

export function useWebRTCManual(doc: Y.Doc) {
  const [messages, setMessages] = useState<WebRTCChatMessage[]>([]);
  const { setDataChannelBufferedAmount } = useStatsForNerds();

  const {
    pcRef,
    syncChannelRef,
    fileTransferChannelRef,
    localOffer,
    localAnswer,
    localCandidates,
    connectionState,
    dataChannelState,
    setDataChannelState,
    createOffer,
    setRemoteOffer,
    createAnswer,
    setRemoteAnswer,
    addCandidate,
    setDataChannelHandler,
    clearDataChannel,
  } = usePeerConnection();

  const { updatePresence, remotePresenceByClient, clearRemotePresence } =
    usePresenceSync(doc);

  // Queue outgoing updates when channel not ready
  const isBufferDrainingRef = useRef(false);
  const flushPendingYUpdatesRef = useRef<() => void>(() => {});

  // Batch local doc changes to reduce network chatter
  const pendingLocalUpdatesRef = useRef<Uint8Array[]>([]);
  const docGuidRef = useRef(doc.guid);
  const resyncNeededRef = useRef(true);
  const localFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAssetRequestsRef = useRef<Map<string, { displayName?: string }>>(
    new Map(),
  );
  const inflightAssetRequestsRef = useRef<Set<string>>(new Set());
  const servingAssetRequestsRef = useRef<Set<string>>(new Set());
  const sendFileRef = useRef<UseFileTransferChannelResult["sendFile"]>(
    async () => null,
  );
  const [fileTransferChannel, setFileTransferChannel] =
    useState<RTCDataChannel | null>(null);

  const scheduleBufferDrain = useCallback(() => {
    const channel = syncChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      return;
    }

    if (channel.bufferedAmount <= DATA_CHANNEL_RESUME_THRESHOLD) {
      if (typeof queueMicrotask === "function") {
        queueMicrotask(() => {
          flushPendingYUpdatesRef.current();
        });
      } else {
        Promise.resolve().then(() => {
          flushPendingYUpdatesRef.current();
        });
      }
      return;
    }

    if (isBufferDrainingRef.current) {
      return;
    }

    isBufferDrainingRef.current = true;
  }, [syncChannelRef]);

  const sendJSONMessage = useCallback(
    (
      message: ChannelMessage,
      options: { onBackpressure?: () => void; context?: string } = {},
    ): boolean => {
      const channel = syncChannelRef.current;
      if (!channel || channel.readyState !== "open") {
        return false;
      }

      const updateBufferedMetrics = () => {
        setDataChannelBufferedAmount(channel.bufferedAmount);
      };

      if (channel.bufferedAmount >= DATA_CHANNEL_MAX_BUFFER) {
        options.onBackpressure?.();
        scheduleBufferDrain();
        updateBufferedMetrics();
        return false;
      }

      const serialized = JSON.stringify(message);

      try {
        channel.send(serialized);
        updateBufferedMetrics();

        if (channel.bufferedAmount >= DATA_CHANNEL_MAX_BUFFER) {
          scheduleBufferDrain();
        }

        return true;
      } catch (error) {
        console.error(
          options.context ?? "Failed to send data channel message:",
          error,
        );

        options.onBackpressure?.();
        scheduleBufferDrain();
        resyncNeededRef.current = true;
        updateBufferedMetrics();

        return false;
      }
    },
    [scheduleBufferDrain, setDataChannelBufferedAmount],
  );

  const handleRemoteChatMessage = useCallback((message: WebRTCChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const {
    applyYUpdate,
    flushPendingYUpdates,
    handleStringMessage,
    resetPendingQueue,
    resetChunkAssembly,
    sendStateVector,
    sendYUpdate,
  } = useYjsSync({
    doc,
    channelRef: syncChannelRef,
    onReceiveChatMessage: handleRemoteChatMessage,
    scheduleBufferDrain,
    sendJSONMessage,
  });

  useEffect(() => {
    flushPendingYUpdatesRef.current = flushPendingYUpdates;
    return () => {
      flushPendingYUpdatesRef.current = () => {};
    };
  }, [flushPendingYUpdates]);

  useEffect(() => {
    if (docGuidRef.current === doc.guid) {
      return;
    }

    docGuidRef.current = doc.guid;
    pendingLocalUpdatesRef.current = [];
    resetPendingQueue();
    resyncNeededRef.current = true;

    const channel = syncChannelRef.current;
    if (channel?.readyState === "open") {
      sendStateVector();
      resyncNeededRef.current = false;
    }
  }, [doc, resetPendingQueue, sendStateVector, syncChannelRef]);

  useEffect(() => {
    if (dataChannelState !== "open") {
      resyncNeededRef.current = true;
    }
  }, [dataChannelState]);

  const handleBufferedAmountLow = useCallback(() => {
    isBufferDrainingRef.current = false;
    const channel = syncChannelRef.current;
    if (channel) {
      setDataChannelBufferedAmount(channel.bufferedAmount);
    }
    flushPendingYUpdates();
  }, [flushPendingYUpdates, setDataChannelBufferedAmount]);

  /**
   * Merge and send batched local document changes.
   * - Reduces network messages by combining rapid edits
   * - Merging multiple updates prevents redundant data
   */
  const flushLocalUpdates = useCallback(() => {
    if (pendingLocalUpdatesRef.current.length === 0) {
      return;
    }

    const updates = pendingLocalUpdatesRef.current;
    pendingLocalUpdatesRef.current = [];
    const mergedUpdate =
      updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);
    sendYUpdate(mergedUpdate);
  }, [sendYUpdate]);

  /**
   * Debounce local updates to batch rapid changes.
   * - 80ms window: balances responsiveness vs network efficiency
   */
  const scheduleLocalFlush = useCallback(() => {
    if (localFlushTimerRef.current !== null) {
      return;
    }

    localFlushTimerRef.current = setTimeout(() => {
      localFlushTimerRef.current = null;
      flushLocalUpdates();
    }, 80);
  }, [flushLocalUpdates]);

  /**
   * Configure data channel for Yjs sync and presence updates.
   * - Binary mode for efficient Yjs updates
   * - Flushes queued updates when channel opens
   * - Clears state on close to prevent stale data
   */
  const setupDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      channel.binaryType = "arraybuffer";
      channel.bufferedAmountLowThreshold = DATA_CHANNEL_RESUME_THRESHOLD;
      channel.addEventListener("bufferedamountlow", handleBufferedAmountLow);
      setDataChannelState(channel.readyState as DataChannelState);

      channel.onopen = () => {
        setDataChannelState("open");
        isBufferDrainingRef.current = false;
        setDataChannelBufferedAmount(channel.bufferedAmount);
        if (resyncNeededRef.current) {
          sendStateVector();
          resyncNeededRef.current = false;
        }
        flushLocalUpdates();
        flushPendingYUpdates();
      };

      channel.onclose = () => {
        resyncNeededRef.current = true;
        setDataChannelState("closed");
        channel.removeEventListener(
          "bufferedamountlow",
          handleBufferedAmountLow,
        );
        isBufferDrainingRef.current = false;
        setDataChannelBufferedAmount(0);
        clearRemotePresence();
        clearDataChannel(SYNC_CHANNEL_LABEL);
        resetChunkAssembly();
      };

      channel.onerror = () => {
        resyncNeededRef.current = true;
      };

      channel.onmessage = (event) => {
        const { data } = event;

        if (typeof data === "string") {
          handleStringMessage(data);
          return;
        }

        if (data instanceof ArrayBuffer) {
          setDataChannelBufferedAmount(channel.bufferedAmount);
          applyYUpdate(new Uint8Array(data));
          return;
        }

        if (data instanceof Blob) {
          setDataChannelBufferedAmount(channel.bufferedAmount);
          data
            .arrayBuffer()
            .then((buffer) => {
              applyYUpdate(new Uint8Array(buffer));
            })
            .catch((error) => {
              console.error("Failed to read binary message:", error);
            });
          return;
        }

        if (ArrayBuffer.isView(data)) {
          const view = data as ArrayBufferView;
          setDataChannelBufferedAmount(channel.bufferedAmount);
          applyYUpdate(
            new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
          );
          return;
        }

        console.warn("Received unsupported data channel message type:", data);
      };
    },
    [
      applyYUpdate,
      clearRemotePresence,
      clearDataChannel,
      flushLocalUpdates,
      flushPendingYUpdates,
      handleBufferedAmountLow,
      handleStringMessage,
      resetChunkAssembly,
      sendStateVector,
      setDataChannelState,
    ],
  );

  usePeerConnectionDataChannel(
    SYNC_CHANNEL_LABEL,
    setDataChannelHandler,
    setupDataChannel,
  );

  const handleRemoteFileRequest = useCallback(
    async (message: FileRequestMessage) => {
      const assetPath = stripPakProtocol(message.assetPath);
      if (!assetPath) {
        console.warn(
          "[WebRTCManual] received invalid asset request",
          message.assetPath,
        );
        return;
      }

      if (servingAssetRequestsRef.current.has(assetPath)) {
        return;
      }

      servingAssetRequestsRef.current.add(assetPath);

      try {
        if (!window?.projectPak?.getAssetData) {
          throw new Error("Project pak bridge is not available");
        }

        const assetData = await window.projectPak.getAssetData(assetPath);
        if (!assetData) {
          throw new Error(`Asset not found in active pak: ${assetPath}`);
        }

        const fileBytes = assetData.data;
        const mimeType = assetData.mimeType || guessMimeType(assetPath);

        const fileName =
          message.displayName ?? assetPath.split("/").pop() ?? "shared-asset";

        let fileToSend: File;

        if (typeof File !== "undefined") {
          fileToSend = new File([fileBytes], fileName, {
            type: mimeType || "application/octet-stream",
          });
        } else {
          const fallback = new Blob([fileBytes], {
            type: mimeType || "application/octet-stream",
          }) as Blob & { name?: string };
          fallback.name = fileName;
          fileToSend = fallback as unknown as File;
        }

        await sendFileRef.current(fileToSend, {
          assetPath,
          displayName: fileName,
        });

        console.info("[WebRTCManual] asset upload complete", {
          assetPath,
          name: fileName,
          size: fileToSend.size,
        });
      } catch (error) {
        console.error("Failed to serve requested asset", error);
      } finally {
        servingAssetRequestsRef.current.delete(assetPath);
        console.info("[WebRTCManual] finished serving asset request", {
          assetPath,
        });
      }
    },
    [],
  );

  const {
    activeTransfers,
    completedTransfers,
    failedTransfers,
    sendFile,
    cancelTransfer,
    requestFile,
  } = useFileTransferChannel({
    channelRef: fileTransferChannelRef,
    channel: fileTransferChannel,
    onFileRequest: handleRemoteFileRequest,
  });

  useEffect(() => {
    sendFileRef.current = sendFile;
  }, [sendFile]);

  const flushPendingAssetRequests = useCallback(() => {
    if (pendingAssetRequestsRef.current.size === 0) {
      return;
    }

    pendingAssetRequestsRef.current.forEach((payload, assetPath) => {
      const sent = requestFile({
        assetPath,
        displayName: payload.displayName,
      });

      if (sent) {
        pendingAssetRequestsRef.current.delete(assetPath);
        inflightAssetRequestsRef.current.add(assetPath);
      } else {
        // Keep the request around and retry when the channel opens again
      }
    });
  }, [requestFile]);

  useEffect(() => {
    flushPendingAssetRequests();
  }, [flushPendingAssetRequests]);

  const handleFileTransferChannel = useCallback(
    (channel: RTCDataChannel) => {
      fileTransferChannelRef.current = channel;
      setFileTransferChannel(channel);

      const handleOpen = () => {
        flushPendingAssetRequests();
      };

      const handleClose = () => {
        console.info("[WebRTCManual] file transfer channel closed");
        setFileTransferChannel((current) =>
          current === channel ? null : current,
        );
        if (fileTransferChannelRef.current === channel) {
          fileTransferChannelRef.current = null;
        }
        channel.removeEventListener("open", handleOpen);
        channel.removeEventListener("close", handleClose);
      };

      channel.addEventListener("open", handleOpen);
      channel.addEventListener("close", handleClose);

      if (channel.readyState === "open") {
        flushPendingAssetRequests();
      }
    },
    [fileTransferChannelRef, flushPendingAssetRequests],
  );

  usePeerConnectionDataChannel(
    FILE_TRANSFER_CHANNEL_LABEL,
    setDataChannelHandler,
    handleFileTransferChannel,
  );

  const requestAsset = useCallback(
    (assetPath: string, displayName?: string) => {
      const trimmed = assetPath.trim();
      if (!trimmed) {
        console.warn("[WebRTCManual] refusing to request empty asset path");
        return false;
      }

      const normalized = stripPakProtocol(trimmed) || trimmed;

      if (pendingAssetRequestsRef.current.has(normalized)) {
        const existing = pendingAssetRequestsRef.current.get(normalized);
        if (displayName && existing && !existing.displayName) {
          pendingAssetRequestsRef.current.set(normalized, { displayName });
        }
        flushPendingAssetRequests();
        return true;
      }

      if (inflightAssetRequestsRef.current.has(normalized)) {
        return true;
      }

      pendingAssetRequestsRef.current.set(
        normalized,
        displayName ? { displayName } : {},
      );
      flushPendingAssetRequests();
      console.info("[WebRTCManual] queued asset request", {
        assetPath: normalized,
        displayName,
      });
      return true;
    },
    [flushPendingAssetRequests],
  );

  const releaseAssetRequest = useCallback((assetPath: string) => {
    const trimmed = assetPath.trim();
    if (!trimmed) {
      return;
    }

    const normalized = stripPakProtocol(trimmed) || trimmed;
    pendingAssetRequestsRef.current.delete(normalized);
    inflightAssetRequestsRef.current.delete(normalized);
    console.info("[WebRTCManual] released asset request", {
      assetPath: normalized,
    });
  }, []);

  useEffect(() => {
    completedTransfers.forEach((transfer) => {
      if (transfer.direction === "incoming" && transfer.assetPath) {
        inflightAssetRequestsRef.current.delete(transfer.assetPath);
      }
    });
  }, [completedTransfers]);

  useEffect(() => {
    failedTransfers.forEach((transfer) => {
      if (transfer.direction === "incoming" && transfer.assetPath) {
        inflightAssetRequestsRef.current.delete(transfer.assetPath);
      }
    });
  }, [failedTransfers]);

  /**
   * Listen for local Yjs document changes and queue for sync.
   * - Ignores updates from WebRTC (prevent echo)
   * - Batches changes to reduce network traffic
   */
  useEffect(() => {
    const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "webrtc") {
        return;
      }

      pendingLocalUpdatesRef.current.push(update.slice());
      scheduleLocalFlush();
    };

    doc.on("update", handleDocUpdate);

    return () => {
      doc.off("update", handleDocUpdate);
    };
  }, [doc, scheduleLocalFlush]);

  /**
   * Send chat message (for testing connection).
   * - Returns false if channel not ready
   */
  const sendMessage = useCallback(
    (message: WebRTCChatMessage) => {
      const channel = syncChannelRef.current;
      if (!channel || channel.readyState !== "open") {
        console.warn("Data channel not open");
        return false;
      }

      const sent = sendJSONMessage(message, {
        context: "Failed to send chat message",
      });

      if (sent) {
        setMessages((prev) => [...prev, message]);
      }

      setDataChannelBufferedAmount(channel.bufferedAmount);

      return sent;
    },
    [sendJSONMessage, setDataChannelBufferedAmount],
  );

  const requestSync = useCallback(() => {
    resyncNeededRef.current = true;
    const channel = syncChannelRef.current;
    if (channel?.readyState === "open") {
      sendStateVector();
      resyncNeededRef.current = false;
    }
  }, [sendStateVector, syncChannelRef]);

  /**
   * Cleanup on unmount.
   * - Flushes pending updates before closing
   * - Closes WebRTC connections gracefully
   */
  useEffect(() => {
    return () => {
      if (localFlushTimerRef.current !== null) {
        clearTimeout(localFlushTimerRef.current);
        localFlushTimerRef.current = null;
      }

      flushLocalUpdates();
      const syncChannel = syncChannelRef.current;
      if (syncChannel) {
        syncChannel.close();
      }
      clearDataChannel(SYNC_CHANNEL_LABEL);
      const fileTransferChannel = fileTransferChannelRef.current;
      if (fileTransferChannel) {
        fileTransferChannel.close();
      }
      clearDataChannel(FILE_TRANSFER_CHANNEL_LABEL);
      const pc = pcRef.current;
      if (pc) {
        pc.close();
      }
      resetChunkAssembly();
      resetPendingQueue();
    };
  }, [
    clearDataChannel,
    fileTransferChannelRef,
    flushLocalUpdates,
    syncChannelRef,
    pcRef,
    resetChunkAssembly,
    resetPendingQueue,
  ]);

  return {
    createOffer,
    setRemoteOffer,
    createAnswer,
    setRemoteAnswer,
    addCandidate,
    sendMessage,
    updatePresence,
    localOffer,
    localAnswer,
    localCandidates,
    connectionState,
    dataChannelState,
    messages,
    remotePresenceByClient,
    requestSync,
    activeTransfers,
    completedTransfers,
    failedTransfers,
    sendFile,
    cancelTransfer,
    requestAsset,
    releaseAssetRequest,
  };
}
