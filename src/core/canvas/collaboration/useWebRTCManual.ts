import { useState, useRef, useCallback, useEffect } from 'react';
import * as Y from 'yjs';

import type {
  ChannelMessage,
  DataChannelState,
  WebRTCChatMessage,
} from './manual-webrtc/types';
import {
  DATA_CHANNEL_MAX_BUFFER,
  DATA_CHANNEL_RESUME_THRESHOLD,
} from './manual-webrtc/types';
import {
  usePeerConnection,
  usePeerConnectionDataChannel,
} from './manual-webrtc/usePeerConnection';
import { usePresenceSync } from './manual-webrtc/usePresenceSync';
import { useYjsSync } from './manual-webrtc/useYjsSync';

export type {
  CollaboratorInteraction,
  CursorPresence,
  WebRTCChatMessage,
} from './manual-webrtc/types';

/**
 * Manual WebRTC hook for peer-to-peer collaboration.
 * - No signaling server: users manually exchange SDP and ICE candidates
 * - Syncs Yjs document updates over WebRTC data channel
 * - Handles presence data (cursors, selections, typing indicators)
 * - Chunks large messages to avoid WebRTC size limits
 */

export function useWebRTCManual(doc: Y.Doc) {
  const [messages, setMessages] = useState<WebRTCChatMessage[]>([]);

  const {
    pcRef,
    dataChannelRef,
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

  const scheduleBufferDrain = useCallback(() => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') {
      return;
    }

    if (channel.bufferedAmount <= DATA_CHANNEL_RESUME_THRESHOLD) {
      if (typeof queueMicrotask === 'function') {
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
  }, []);

  const sendJSONMessage = useCallback(
    (
      message: ChannelMessage,
      options: { onBackpressure?: () => void; context?: string } = {},
    ): boolean => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== 'open') {
        return false;
      }

      if (channel.bufferedAmount >= DATA_CHANNEL_MAX_BUFFER) {
        options.onBackpressure?.();
        scheduleBufferDrain();
        return false;
      }

      const serialized = JSON.stringify(message);

      try {
        channel.send(serialized);

        if (channel.bufferedAmount >= DATA_CHANNEL_MAX_BUFFER) {
          scheduleBufferDrain();
        }

        return true;
      } catch (error) {
        const isOperationError =
          error instanceof DOMException && error.name === 'OperationError';

        console.error(options.context ?? 'Failed to send data channel message:', error);

        if (isOperationError) {
          options.onBackpressure?.();
          scheduleBufferDrain();
        }

        return false;
      }
    },
    [scheduleBufferDrain],
  );

  const handleRemoteChatMessage = useCallback(
    (message: WebRTCChatMessage) => {
      setMessages((prev) => [...prev, message]);
    },
    [],
  );

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
    dataChannelRef,
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

    const channel = dataChannelRef.current;
    if (channel?.readyState === 'open') {
      sendStateVector();
      resyncNeededRef.current = false;
    }
  }, [dataChannelRef, doc, resetPendingQueue, sendStateVector]);

  useEffect(() => {
    if (dataChannelState !== 'open') {
      resyncNeededRef.current = true;
    }
  }, [dataChannelState]);

  const handleBufferedAmountLow = useCallback(() => {
    isBufferDrainingRef.current = false;
    flushPendingYUpdates();
  }, [flushPendingYUpdates]);

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
      channel.binaryType = 'arraybuffer';
      channel.bufferedAmountLowThreshold = DATA_CHANNEL_RESUME_THRESHOLD;
      channel.addEventListener('bufferedamountlow', handleBufferedAmountLow);
      setDataChannelState(channel.readyState as DataChannelState);

      channel.onopen = () => {
        setDataChannelState('open');
        isBufferDrainingRef.current = false;
        if (resyncNeededRef.current) {
          sendStateVector();
          resyncNeededRef.current = false;
        }
        flushLocalUpdates();
        flushPendingYUpdates();
      };

      channel.onclose = () => {
        resyncNeededRef.current = true;
        setDataChannelState('closed');
        channel.removeEventListener('bufferedamountlow', handleBufferedAmountLow);
        isBufferDrainingRef.current = false;
        clearRemotePresence();
        clearDataChannel();
        resetChunkAssembly();
      };

      channel.onerror = () => {
        resyncNeededRef.current = true;
      };

      channel.onmessage = (event) => {
        const { data } = event;

        if (typeof data === 'string') {
          handleStringMessage(data);
          return;
        }

        if (data instanceof ArrayBuffer) {
          applyYUpdate(new Uint8Array(data));
          return;
        }

        if (data instanceof Blob) {
          data
            .arrayBuffer()
            .then((buffer) => {
              applyYUpdate(new Uint8Array(buffer));
            })
            .catch((error) => {
              console.error('Failed to read binary message:', error);
            });
          return;
        }

        if (ArrayBuffer.isView(data)) {
          const view = data as ArrayBufferView;
          applyYUpdate(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
          return;
        }

        console.warn('Received unsupported data channel message type:', data);
      };
    },
    [
      applyYUpdate,
      clearRemotePresence,
      flushLocalUpdates,
      flushPendingYUpdates,
      handleBufferedAmountLow,
      handleStringMessage,
      resetChunkAssembly,
      sendStateVector,
      setDataChannelState,
    ],
  );

  usePeerConnectionDataChannel(setDataChannelHandler, setupDataChannel);

  /**
   * Listen for local Yjs document changes and queue for sync.
   * - Ignores updates from WebRTC (prevent echo)
   * - Batches changes to reduce network traffic
   */
  useEffect(() => {
    const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'webrtc') {
        return;
      }

      pendingLocalUpdatesRef.current.push(update.slice());
      scheduleLocalFlush();
    };

    doc.on('update', handleDocUpdate);

    return () => {
      doc.off('update', handleDocUpdate);
    };
  }, [doc, scheduleLocalFlush]);

  /**
   * Send chat message (for testing connection).
   * - Returns false if channel not ready
   */
  const sendMessage = useCallback(
    (message: WebRTCChatMessage) => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== 'open') {
        console.warn('Data channel not open');
        return false;
      }

      const sent = sendJSONMessage(message, {
        context: 'Failed to send chat message',
      });

      if (sent) {
        setMessages((prev) => [...prev, message]);
      }

      return sent;
    },
    [sendJSONMessage],
  );

  const requestSync = useCallback(() => {
    resyncNeededRef.current = true;
    const channel = dataChannelRef.current;
    if (channel?.readyState === 'open') {
      sendStateVector();
      resyncNeededRef.current = false;
    }
  }, [dataChannelRef, sendStateVector]);

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
      const channel = dataChannelRef.current;
      if (channel) {
        channel.close();
      }
      clearDataChannel();
      const pc = pcRef.current;
      if (pc) {
        pc.close();
      }
      resetChunkAssembly();
      resetPendingQueue();
    };
  }, [
    clearDataChannel,
    dataChannelRef,
    flushLocalUpdates,
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
  };
}
