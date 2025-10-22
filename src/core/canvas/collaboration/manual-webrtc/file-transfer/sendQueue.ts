import { MutableRefObject, useCallback, useEffect, useRef } from 'react';

import { DATA_CHANNEL_MAX_BUFFER } from '../types';

export interface PendingChunkPacket {
  id: string;
  sequence: number;
  frame: ArrayBuffer;
  size: number;
}

type QueueSnapshotCallback = (length: number, totalBytes: number) => void;

export const useSendQueue = (
  channelRef: MutableRefObject<RTCDataChannel | null>,
  onSnapshotUpdate?: QueueSnapshotCallback,
) => {
  const queueRef = useRef<PendingChunkPacket[]>([]);
  const queuedBytesRef = useRef(0);
  const drainScheduledRef = useRef(false);
  const diagnosticsCallbackRef = useRef<QueueSnapshotCallback | undefined>(onSnapshotUpdate);

  useEffect(() => {
    diagnosticsCallbackRef.current = onSnapshotUpdate;
  }, [onSnapshotUpdate]);

  const emitSnapshot = useCallback(() => {
    const callback = diagnosticsCallbackRef.current;
    if (callback) {
      callback(queueRef.current.length, queuedBytesRef.current);
    }
  }, []);

  const scheduleDrain = useCallback(() => {
    if (drainScheduledRef.current) {
      return;
    }

    drainScheduledRef.current = true;
    Promise.resolve().then(() => {
      drainScheduledRef.current = false;

      const channel = channelRef.current;
      if (!channel || channel.readyState !== 'open') {
        return;
      }

      while (queueRef.current.length > 0) {
        if (channel.bufferedAmount >= DATA_CHANNEL_MAX_BUFFER) {
          return;
        }

        const packet = queueRef.current.shift();
        if (!packet) {
          break;
        }

        try {
          channel.send(packet.frame);
        } catch (error) {
          console.error('Failed to send data channel frame', error);
          break;
        }

        queuedBytesRef.current = Math.max(0, queuedBytesRef.current - packet.size);
        emitSnapshot();
      }
    });
  }, [channelRef, emitSnapshot]);

  const queuePacket = useCallback(
    (packet: PendingChunkPacket) => {
      queueRef.current.push(packet);
      queuedBytesRef.current += packet.size;
      emitSnapshot();
      scheduleDrain();
    },
    [emitSnapshot, scheduleDrain],
  );

  const clearPacketsForTransfer = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter((packet) => packet.id !== id);
    queuedBytesRef.current = queueRef.current.reduce((sum, packet) => sum + packet.size, 0);
    emitSnapshot();
  }, [emitSnapshot]);

  const resetQueue = useCallback(() => {
    queueRef.current = [];
    queuedBytesRef.current = 0;
    emitSnapshot();
  }, [emitSnapshot]);

  return {
    queuePacket,
    clearPacketsForTransfer,
    resetQueue,
  };
};
