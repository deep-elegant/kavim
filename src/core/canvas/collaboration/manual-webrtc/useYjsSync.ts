import { MutableRefObject, useCallback, useMemo, useRef } from 'react';
import * as Y from 'yjs';

import {
  ChannelMessage,
  DATA_CHANNEL_MAX_BUFFER,
  MAX_MESSAGE_CHUNK_SIZE,
  SyncMessage,
  WebRTCChatMessage,
} from './types';
import { decodeFromBase64, encodeToBase64 } from './encoding';

interface UseYjsSyncParams {
  doc: Y.Doc;
  dataChannelRef: MutableRefObject<RTCDataChannel | null>;
  scheduleBufferDrain: () => void;
  sendJSONMessage: (
    message: ChannelMessage,
    options?: { onBackpressure?: () => void; context?: string },
  ) => boolean;
  onReceiveChatMessage: (message: WebRTCChatMessage) => void;
}

interface UseYjsSyncResult {
  sendStateVector: () => void;
  sendYUpdate: (update: Uint8Array) => boolean;
  flushPendingYUpdates: () => void;
  handleStringMessage: (raw: string) => void;
  applyYUpdate: (update: Uint8Array) => void;
  resetChunkAssembly: () => void;
  resetPendingQueue: () => void;
}

type PendingChunk = {
  total: number;
  received: number;
  parts: string[];
};

export const useYjsSync = ({
  doc,
  dataChannelRef,
  onReceiveChatMessage,
  scheduleBufferDrain,
  sendJSONMessage,
}: UseYjsSyncParams): UseYjsSyncResult => {
  const pendingYUpdatesRef = useRef<Uint8Array[]>([]);
  const incomingChunksRef = useRef<Map<string, PendingChunk>>(new Map());

  const enqueueYUpdate = useCallback(
    (update: Uint8Array) => {
      pendingYUpdatesRef.current.push(update);
      scheduleBufferDrain();
    },
    [scheduleBufferDrain],
  );

  const sendYUpdate = useCallback(
    (update: Uint8Array): boolean => {
      const channel = dataChannelRef.current;
      const updateCopy = update.slice();

      if (!channel || channel.readyState !== 'open') {
        enqueueYUpdate(updateCopy);
        return false;
      }

      if (channel.bufferedAmount >= DATA_CHANNEL_MAX_BUFFER) {
        enqueueYUpdate(updateCopy);
        return false;
      }

      const encoded = encodeToBase64(updateCopy);
      const sendChunk = (message: ChannelMessage, context: string) =>
        sendJSONMessage(message, {
          onBackpressure: () => enqueueYUpdate(updateCopy),
          context,
        });

      if (encoded.length <= MAX_MESSAGE_CHUNK_SIZE) {
        return sendChunk({ type: 'yjs-update', update: encoded }, 'Failed to send Yjs update message');
      }

      const chunkId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const totalChunks = Math.ceil(encoded.length / MAX_MESSAGE_CHUNK_SIZE);

      for (let index = 0; index < totalChunks; index += 1) {
        const start = index * MAX_MESSAGE_CHUNK_SIZE;
        const end = start + MAX_MESSAGE_CHUNK_SIZE;
        const chunk = encoded.slice(start, end);
        const success = sendChunk(
          {
            type: 'yjs-update-chunk',
            id: chunkId,
            index,
            total: totalChunks,
            chunk,
          },
          'Failed to send Yjs update chunk',
        );

        if (!success) {
          return false;
        }
      }

      return true;
    },
    [dataChannelRef, enqueueYUpdate, sendJSONMessage],
  );

  const flushPendingYUpdates = useCallback(() => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') {
      return;
    }

    while (pendingYUpdatesRef.current.length > 0) {
      if (channel.bufferedAmount >= DATA_CHANNEL_MAX_BUFFER) {
        scheduleBufferDrain();
        return;
      }

      const nextUpdate = pendingYUpdatesRef.current.shift();
      if (!nextUpdate) {
        break;
      }

      const sent = sendYUpdate(nextUpdate);
      if (!sent) {
        return;
      }
    }
  }, [dataChannelRef, scheduleBufferDrain, sendYUpdate]);

  const applyYUpdate = useCallback(
    (update: Uint8Array) => {
      try {
        Y.applyUpdate(doc, update, 'webrtc');
      } catch (error) {
        console.error('Failed to apply Yjs update:', error);
      }
    },
    [doc],
  );

  const sendStateVector = useCallback(() => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') {
      return;
    }

    const vector = encodeToBase64(Y.encodeStateVector(doc));
    const message: SyncMessage = { type: 'yjs-sync', vector };

    void sendJSONMessage(message, { context: 'Failed to send state vector' });
  }, [dataChannelRef, doc, sendJSONMessage]);

  const handleStringMessage = useCallback(
    (raw: string) => {
      let message: ChannelMessage;
      try {
        message = JSON.parse(raw) as ChannelMessage;
      } catch (error) {
        console.error('Failed to parse message:', error);
        return;
      }

      if (message.type === 'chat') {
        onReceiveChatMessage(message);
        return;
      }

      if (message.type === 'yjs-sync') {
        const remoteVector = decodeFromBase64(message.vector);
        const diff = Y.encodeStateAsUpdate(doc, remoteVector);
        if (diff.byteLength > 0) {
          sendYUpdate(diff);
        }
        flushPendingYUpdates();
        return;
      }

      if (message.type === 'yjs-update') {
        applyYUpdate(decodeFromBase64(message.update));
        return;
      }

      if (message.type === 'yjs-update-chunk') {
        const { id, index, total, chunk } = message;

        if (index < 0 || index >= total) {
          console.warn('Received Yjs chunk with invalid index', message);
          return;
        }

        let entry = incomingChunksRef.current.get(id);
        if (!entry || entry.total !== total) {
          entry = {
            total,
            received: 0,
            parts: new Array<string>(total),
          };
        }

        if (!entry) {
          return;
        }

        if (entry.parts[index] === undefined) {
          entry.parts[index] = chunk;
          entry.received += 1;
        }

        incomingChunksRef.current.set(id, entry);

        if (entry.received === entry.total) {
          incomingChunksRef.current.delete(id);
          const combined = entry.parts.join('');
          applyYUpdate(decodeFromBase64(combined));
        }
      }
    },
    [
      applyYUpdate,
      doc,
      flushPendingYUpdates,
      onReceiveChatMessage,
      sendYUpdate,
    ],
  );

  const resetChunkAssembly = useCallback(() => {
    incomingChunksRef.current.clear();
  }, []);

  const resetPendingQueue = useCallback(() => {
    pendingYUpdatesRef.current = [];
  }, []);

  return useMemo(
    () => ({
      applyYUpdate,
      resetPendingQueue,
      resetChunkAssembly,
      flushPendingYUpdates,
      handleStringMessage,
      sendStateVector,
      sendYUpdate,
    }),
    [
      applyYUpdate,
      resetPendingQueue,
      resetChunkAssembly,
      flushPendingYUpdates,
      handleStringMessage,
      sendStateVector,
      sendYUpdate,
    ],
  );
};
