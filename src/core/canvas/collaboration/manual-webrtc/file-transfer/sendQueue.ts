import { MutableRefObject, useCallback, useRef } from 'react';

import { DATA_CHANNEL_MAX_BUFFER } from '../types';

export interface PendingChunkPacket {
  id: string;
  sequence: number;
  frame: ArrayBuffer;
  size: number;
}

export const useSendQueue = (channelRef: MutableRefObject<RTCDataChannel | null>) => {
  const queueRef = useRef<PendingChunkPacket[]>([]);
  const drainScheduledRef = useRef(false);

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
      }
    });
  }, [channelRef]);

  const queuePacket = useCallback(
    (packet: PendingChunkPacket) => {
      queueRef.current.push(packet);
      scheduleDrain();
    },
    [scheduleDrain],
  );

  const clearPacketsForTransfer = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter((packet) => packet.id !== id);
  }, []);

  const resetQueue = useCallback(() => {
    queueRef.current = [];
  }, []);

  return {
    queuePacket,
    clearPacketsForTransfer,
    resetQueue,
  };
};
