import { MutableRefObject, useCallback, useEffect, useMemo, useRef } from 'react';

import { DATA_CHANNEL_RESUME_THRESHOLD } from '../types';
import { calculateChunkSize, calculateTotalChunks, getChunkBounds } from './chunking';
import { decodeChunkFrame, encodeChunkFrame } from './frames';
import { createIncomingTransferState, IncomingTransferState } from './incomingTransfers';
import {
  OutgoingTransferState,
  createOutgoingTransferState,
  pumpTransferWindow,
  queueMissingChunks,
  startRetryTimer,
  stopRetryTimer,
} from './outgoingTransfers';
import { useSendQueue } from './sendQueue';
import { useTransferStore } from './transferStore';
import {
  FileAckMessage,
  FileChunkFrame,
  FileCompleteMessage,
  FileErrorMessage,
  FileInitMessage,
  FileResendMessage,
  FileTransfer,
  FileTransferControlMessage,
  FileTransferStatus,
} from './types';

interface UseFileTransferChannelParams {
  channelRef: MutableRefObject<RTCDataChannel | null>;
}

const createTransferId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const now = () => Date.now();

const INITIAL_BYTES = 0;

export interface UseFileTransferChannelResult {
  activeTransfers: FileTransfer[];
  completedTransfers: FileTransfer[];
  failedTransfers: FileTransfer[];
  sendFile: (file: File) => Promise<string | null>;
  cancelTransfer: (id: string) => void;
}

export const useFileTransferChannel = ({
  channelRef,
}: UseFileTransferChannelParams): UseFileTransferChannelResult => {
  const { activeTransfers, completedTransfers, failedTransfers, setTransfer, updateTransfer } =
    useTransferStore();

  const outgoingTransfersRef = useRef<Map<string, OutgoingTransferState>>(new Map());
  const incomingTransfersRef = useRef<Map<string, IncomingTransferState>>(new Map());
  const configuredChannelRef = useRef<RTCDataChannel | null>(null);

  const { queuePacket, clearPacketsForTransfer, resetQueue } = useSendQueue(channelRef);

  const sendControlMessage = useCallback(
    (message: FileTransferControlMessage) => {
      const channel = channelRef.current;
      if (!channel || channel.readyState !== 'open') {
        return false;
      }

      try {
        channel.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Failed to send control message', message, error);
        return false;
      }
    },
    [channelRef],
  );

  const finalizeOutgoingTransfer = useCallback(
    (id: string) => {
      const state = outgoingTransfersRef.current.get(id);
      if (!state) {
        return;
      }

      stopRetryTimer(state);
      outgoingTransfersRef.current.delete(id);

      updateTransfer(id, (previous) => {
        if (!previous) {
          return previous;
        }

        const completedAt = now();
        return {
          ...previous,
          status: 'completed',
          bytesTransferred: previous.totalBytes,
          progress: 1,
          completedAt,
          updatedAt: completedAt,
        };
      });
    },
    [updateTransfer],
  );

  const failTransfer = useCallback(
    (id: string, reason: string) => {
      const outgoing = outgoingTransfersRef.current.get(id);
      if (outgoing) {
        stopRetryTimer(outgoing);
      }

      outgoingTransfersRef.current.delete(id);
      incomingTransfersRef.current.delete(id);

      updateTransfer(id, (previous) => {
        if (!previous) {
          return null;
        }

        const updatedAt = now();
        return {
          ...previous,
          status: 'failed',
          error: reason,
          updatedAt,
        };
      });
    },
    [updateTransfer],
  );

  const requestMissingChunks = useCallback(
    (state: OutgoingTransferState, missing: number[]) => {
      void queueMissingChunks(state, missing, encodeChunkFrame, queuePacket);
    },
    [queuePacket],
  );

  const pumpWindow = useCallback(
    (state: OutgoingTransferState) => {
      void pumpTransferWindow(state, encodeChunkFrame, queuePacket);
    },
    [queuePacket],
  );

  const handleAckMessage = useCallback(
    (message: FileAckMessage) => {
      const state = outgoingTransfersRef.current.get(message.id);
      if (!state) {
        return;
      }

      state.lastAckTime = now();

      for (const index of message.acked) {
        if (state.inFlight.has(index)) {
          state.inFlight.delete(index);

          const { start, end } = getChunkBounds(index, state.chunkSize, state.file.size);
          state.bytesAcked += end - start;
        }
      }

      if (message.missing?.length) {
        requestMissingChunks(state, message.missing);
      }

      pumpWindow(state);

      updateTransfer(message.id, (previous) => {
        if (!previous) {
          return previous;
        }

        const updatedAt = now();
        const bytesTransferred = Math.min(previous.totalBytes, state.bytesAcked);
        const progress = previous.totalBytes
          ? Math.min(1, bytesTransferred / previous.totalBytes)
          : previous.progress;

        const status: FileTransferStatus =
          progress > 0 && previous.status === 'pending' ? 'in-progress' : previous.status;

        return {
          ...previous,
          status,
          bytesTransferred,
          progress,
          updatedAt,
        };
      });
    },
    [pumpWindow, requestMissingChunks, updateTransfer],
  );

  const handleCompleteMessage = useCallback(
    (message: FileCompleteMessage) => {
      finalizeOutgoingTransfer(message.id);
    },
    [finalizeOutgoingTransfer],
  );

  const handleErrorMessage = useCallback(
    (message: FileErrorMessage) => {
      failTransfer(message.id, message.reason);
    },
    [failTransfer],
  );

  const handleResendMessage = useCallback(
    (message: FileResendMessage) => {
      const state = outgoingTransfersRef.current.get(message.id);
      if (!state) {
        return;
      }

      requestMissingChunks(state, message.missing);
    },
    [requestMissingChunks],
  );

  const sendAck = useCallback(
    (message: FileAckMessage) => {
      void sendControlMessage(message);
    },
    [sendControlMessage],
  );

  const sendResendRequest = useCallback(
    (id: string, missing: number[]) => {
      if (missing.length === 0) {
        return;
      }

      const uniqueMissing = Array.from(new Set(missing)).sort((a, b) => a - b);
      void sendControlMessage({ type: 'file-resend', id, missing: uniqueMissing });
    },
    [sendControlMessage],
  );

  const finalizeIncomingTransfer = useCallback(
    async (state: IncomingTransferState) => {
      if (state.completed) {
        return;
      }

      const orderedPayloads: ArrayBuffer[] = [];
      for (let index = 0; index < state.totalChunks; index += 1) {
        const chunk = state.chunks.get(index);
        if (!chunk) {
          return;
        }
        orderedPayloads.push(chunk);
      }

      const blob = new Blob(orderedPayloads, { type: state.mimeType || 'application/octet-stream' });
      state.completed = true;
      incomingTransfersRef.current.delete(state.id);

      updateTransfer(state.id, (previous) => {
        if (!previous) {
          return previous;
        }

        const completedAt = now();
        return {
          ...previous,
          status: 'completed',
          bytesTransferred: previous.totalBytes,
          progress: 1,
          payload: blob,
          completedAt,
          updatedAt: completedAt,
        };
      });

      void sendControlMessage({ type: 'file-complete', id: state.id });
    },
    [sendControlMessage, updateTransfer],
  );

  const handleChunkFrame = useCallback(
    async ({ id, sequence, payload }: FileChunkFrame) => {
      const incoming = incomingTransfersRef.current.get(id);
      if (!incoming) {
        return;
      }

      if (incoming.chunks.has(sequence)) {
        sendAck({
          type: 'file-ack',
          id,
          acked: [sequence],
          receivedBytes: incoming.receivedBytes,
          receivedChunks: incoming.chunks.size,
        });
        return;
      }

      incoming.chunks.set(sequence, payload);
      incoming.receivedBytes += payload.byteLength;

      while (incoming.chunks.has(incoming.expectedSequence)) {
        incoming.expectedSequence += 1;
      }

      const missing: number[] = [];
      for (let index = 0; index < incoming.expectedSequence; index += 1) {
        if (!incoming.chunks.has(index)) {
          missing.push(index);
        }
      }

      const receivedChunks = incoming.chunks.size;
      sendAck({
        type: 'file-ack',
        id,
        acked: [sequence],
        receivedBytes: incoming.receivedBytes,
        receivedChunks,
        missing: missing.length ? missing : undefined,
      });

      if (missing.length) {
        sendResendRequest(id, missing);
      }

      updateTransfer(id, (previous) => {
        if (!previous) {
          return previous;
        }

        const updatedAt = now();
        const progress = previous.totalBytes
          ? Math.min(1, incoming.receivedBytes / previous.totalBytes)
          : previous.progress;

        const status: FileTransferStatus =
          progress > 0 && previous.status === 'pending' ? 'in-progress' : previous.status;

        return {
          ...previous,
          status,
          bytesTransferred: incoming.receivedBytes,
          progress,
          updatedAt,
        };
      });

      if (incoming.chunks.size === incoming.totalChunks) {
        await finalizeIncomingTransfer(incoming);
      }
    },
    [finalizeIncomingTransfer, sendAck, sendResendRequest, updateTransfer],
  );

  const handleInitMessage = useCallback(
    (message: FileInitMessage) => {
      if (incomingTransfersRef.current.has(message.id)) {
        return;
      }

      const startedAt = now();
      const state = createIncomingTransferState(message);
      incomingTransfersRef.current.set(message.id, state);

      setTransfer({
        id: message.id,
        name: message.name,
        mimeType: message.mimeType,
        size: message.size,
        chunkSize: message.chunkSize,
        totalChunks: message.totalChunks,
        direction: 'incoming',
        status: 'pending',
        bytesTransferred: INITIAL_BYTES,
        totalBytes: message.size,
        progress: 0,
        startedAt,
        updatedAt: startedAt,
      });
    },
    [setTransfer],
  );

  const handleControlMessage = useCallback(
    (message: FileTransferControlMessage) => {
      switch (message.type) {
        case 'file-init':
          handleInitMessage(message);
          break;
        case 'file-ack':
          handleAckMessage(message);
          break;
        case 'file-complete':
          handleCompleteMessage(message);
          break;
        case 'file-error':
          handleErrorMessage(message);
          break;
        case 'file-resend':
          handleResendMessage(message);
          break;
        default: {
          const neverType: never = message;
          void neverType;
        }
      }
    },
    [
      handleAckMessage,
      handleCompleteMessage,
      handleErrorMessage,
      handleInitMessage,
      handleResendMessage,
    ],
  );

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      const { data } = event;
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data) as FileTransferControlMessage;
          handleControlMessage(parsed);
        } catch (error) {
          console.error('Failed to parse file transfer control message', error);
        }
        return;
      }

      const frame = await decodeChunkFrame(data);
      if (!frame) {
        return;
      }

      await handleChunkFrame(frame);
    },
    [handleChunkFrame, handleControlMessage],
  );

  const resetStateOnClose = useCallback(() => {
    outgoingTransfersRef.current.forEach((state, id) => {
      stopRetryTimer(state);
      updateTransfer(id, (previous) => {
        if (!previous) {
          return previous;
        }

        const updatedAt = now();
        return {
          ...previous,
          status: previous.status === 'completed' ? previous.status : 'failed',
          error:
            previous.status === 'completed'
              ? previous.error
              : previous.error ?? 'Data channel closed unexpectedly',
          updatedAt,
        };
      });
    });

    outgoingTransfersRef.current.clear();
    incomingTransfersRef.current.clear();
    resetQueue();
  }, [resetQueue, updateTransfer]);

  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || channel === configuredChannelRef.current) {
      return;
    }

    configuredChannelRef.current = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = DATA_CHANNEL_RESUME_THRESHOLD;

    const handleBufferedAmountLow = () => {
      outgoingTransfersRef.current.forEach((state) => {
        if (state.cancelled) {
          return;
        }

        pumpWindow(state);
      });
    };

    const handleOpen = () => {
      pumpWindowForAll();
    };

    const handleClose = () => {
      resetStateOnClose();
    };

    const handleError = () => {
      resetStateOnClose();
    };

    const pumpWindowForAll = () => {
      outgoingTransfersRef.current.forEach((state) => {
        pumpWindow(state);
      });
    };

    channel.addEventListener('message', handleMessage);
    channel.addEventListener('open', handleOpen);
    channel.addEventListener('close', handleClose);
    channel.addEventListener('error', handleError);
    channel.addEventListener('bufferedamountlow', handleBufferedAmountLow);

    if (channel.readyState === 'open') {
      pumpWindowForAll();
    }

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.removeEventListener('open', handleOpen);
      channel.removeEventListener('close', handleClose);
      channel.removeEventListener('error', handleError);
      channel.removeEventListener('bufferedamountlow', handleBufferedAmountLow);
    };
  }, [channelRef, handleMessage, pumpWindow, resetStateOnClose]);

  const cancelTransfer = useCallback(
    (id: string) => {
      const state = outgoingTransfersRef.current.get(id);
      if (!state) {
        return;
      }

      state.cancelled = true;
      stopRetryTimer(state);
      outgoingTransfersRef.current.delete(id);

      clearPacketsForTransfer(id);

      void sendControlMessage({ type: 'file-error', id, reason: 'cancelled' });

      updateTransfer(id, (previous) => {
        if (!previous) {
          return previous;
        }

        const updatedAt = now();
        return {
          ...previous,
          status: 'cancelled',
          error: previous.error ?? 'Cancelled by user',
          updatedAt,
        };
      });
    },
    [clearPacketsForTransfer, sendControlMessage, updateTransfer],
  );

  const sendFile = useCallback(
    async (file: File): Promise<string | null> => {
      const channel = channelRef.current;
      if (!channel || channel.readyState !== 'open') {
        console.warn('File transfer channel is not open');
        return null;
      }

      const id = createTransferId();
      const chunkSize = calculateChunkSize(file.size);
      const totalChunks = calculateTotalChunks(file.size, chunkSize);
      const startedAt = now();

      const metadata: FileInitMessage = {
        type: 'file-init',
        id,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        chunkSize,
        totalChunks,
      };

      const initialTransfer: FileTransfer = {
        id,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        chunkSize,
        totalChunks,
        direction: 'outgoing',
        status: 'pending',
        bytesTransferred: INITIAL_BYTES,
        totalBytes: file.size,
        progress: 0,
        startedAt,
        updatedAt: startedAt,
        originalFile: file,
      };

      setTransfer(initialTransfer);

      const transferState = createOutgoingTransferState(id, file, chunkSize, totalChunks, now);
      outgoingTransfersRef.current.set(id, transferState);

      const initSent = sendControlMessage(metadata);
      if (!initSent) {
        failTransfer(id, 'Failed to send file metadata');
        return null;
      }

      startRetryTimer(transferState, now, (state, missing) => {
        requestMissingChunks(state, missing);
      });

      pumpWindow(transferState);

      return id;
    },
    [
      calculateChunkSize,
      calculateTotalChunks,
      channelRef,
      failTransfer,
      pumpWindow,
      requestMissingChunks,
      sendControlMessage,
      setTransfer,
    ],
  );

  useEffect(() => {
    return () => {
      outgoingTransfersRef.current.forEach((state) => {
        stopRetryTimer(state);
      });
    };
  }, []);

  return useMemo(
    () => ({
      activeTransfers,
      completedTransfers,
      failedTransfers,
      sendFile,
      cancelTransfer,
    }),
    [activeTransfers, cancelTransfer, completedTransfers, failedTransfers, sendFile],
  );
};
