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
  FileRequestMessage,
  FileResendMessage,
  FileTransfer,
  FileTransferControlMessage,
  FileTransferStatus,
} from './types';
import { useStatsForNerds } from '../../../../diagnostics/StatsForNerdsContext';
import type { PendingChunkPacket } from './sendQueue';

const LOGGABLE_CONTROL_TYPES: FileTransferControlMessage['type'][] = [
  'file-request',
  'file-init',
  'file-complete',
  'file-error',
];

interface UseFileTransferChannelParams {
  channelRef: MutableRefObject<RTCDataChannel | null>;
  channel?: RTCDataChannel | null;
  onFileRequest?: (message: FileRequestMessage) => void;
}

type SendFileOptions = {
  assetPath?: string;
  displayName?: string;
};

const createTransferId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const now = () => Date.now();

const INITIAL_BYTES = 0;

const configureDataChannel = (channel: RTCDataChannel) => {
  channel.binaryType = 'arraybuffer';
  channel.bufferedAmountLowThreshold = DATA_CHANNEL_RESUME_THRESHOLD;
};

export interface UseFileTransferChannelResult {
  activeTransfers: FileTransfer[];
  completedTransfers: FileTransfer[];
  failedTransfers: FileTransfer[];
  sendFile: (file: File, options?: SendFileOptions) => Promise<string | null>;
  requestFile: (payload: Omit<FileRequestMessage, 'type'>) => boolean;
  cancelTransfer: (id: string) => void;
}

export const useFileTransferChannel = ({
  channelRef,
  channel,
  onFileRequest,
}: UseFileTransferChannelParams): UseFileTransferChannelResult => {
  const { activeTransfers, completedTransfers, failedTransfers, setTransfer, updateTransfer } =
    useTransferStore();

  const outgoingTransfersRef = useRef<Map<string, OutgoingTransferState>>(new Map());
  const incomingTransfersRef = useRef<Map<string, IncomingTransferState>>(new Map());
  const configuredChannelRef = useRef<RTCDataChannel | null>(null);
  const channelCleanupRef = useRef<(() => void) | null>(null);

  const {
    recordFileTransferOutbound,
    recordFileTransferInbound,
    setFileTransferQueueSnapshot,
  } = useStatsForNerds();
  const { queuePacket, clearPacketsForTransfer, resetQueue } = useSendQueue(
    channelRef,
    setFileTransferQueueSnapshot,
  );
  const textEncoder = useMemo(() => new TextEncoder(), []);

  const queueFilePacket = useCallback(
    (packet: PendingChunkPacket) => {
      recordFileTransferOutbound(packet.frame.byteLength);
      queuePacket(packet);
    },
    [queuePacket, recordFileTransferOutbound],
  );

  const sendControlMessage = useCallback(
    (message: FileTransferControlMessage) => {
      const channel = channelRef.current;
      if (!channel || channel.readyState !== 'open') {
        return false;
      }

      try {
        const payload = JSON.stringify(message);
        channel.send(payload);
        recordFileTransferOutbound(textEncoder.encode(payload).byteLength);
        return true;
      } catch (error) {
        console.error('Failed to send control message', message, error);
        return false;
      }
    },
    [channelRef, recordFileTransferOutbound, textEncoder],
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
        console.error('[FileTransfer] transfer failed', {
          id,
          assetPath: previous.assetPath,
          name: previous.name,
          reason,
        });
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
      void queueMissingChunks(state, missing, encodeChunkFrame, queueFilePacket);
    },
    [queueFilePacket],
  );

  const pumpWindow = useCallback(
    (state: OutgoingTransferState) => {
      void pumpTransferWindow(state, encodeChunkFrame, queueFilePacket);
    },
    [queueFilePacket],
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
        assetPath: message.assetPath,
      });
    },
    [setTransfer],
  );

  const handleControlMessage = useCallback(
    (message: FileTransferControlMessage) => {
      if (LOGGABLE_CONTROL_TYPES.includes(message.type)) {
        console.info('[FileTransfer] received control message', {
          direction: 'incoming',
          type: message.type,
          id: 'id' in message ? message.id : undefined,
          assetPath: 'assetPath' in message ? message.assetPath : undefined,
          reason: 'reason' in message ? message.reason : undefined,
        });
      }
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
        case 'file-request':
          onFileRequest?.(message);
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
      onFileRequest,
    ],
  );

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      const { data } = event;
      if (typeof data === 'string') {
        recordFileTransferInbound(textEncoder.encode(data).byteLength);
        try {
          const parsed = JSON.parse(data) as FileTransferControlMessage;
          handleControlMessage(parsed);
        } catch (error) {
          console.error('Failed to parse file transfer control message', error);
        }
        return;
      }

      if (data instanceof ArrayBuffer) {
        recordFileTransferInbound(data.byteLength);
      } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
        recordFileTransferInbound(data.size);
      }

      const frame = await decodeChunkFrame(data);
      if (!frame) {
        return;
      }

      await handleChunkFrame(frame);
    },
    [handleChunkFrame, handleControlMessage, recordFileTransferInbound, textEncoder],
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
    const nextChannel = channelRef.current;

    if (configuredChannelRef.current === nextChannel) {
      return channelCleanupRef.current ?? undefined;
    }

    if (channelCleanupRef.current) {
      channelCleanupRef.current();
      channelCleanupRef.current = null;
    }

    if (!nextChannel) {
      configuredChannelRef.current = null;
      return undefined;
    }

    configuredChannelRef.current = nextChannel;
    configureDataChannel(nextChannel);

    const pumpWindowForAll = () => {
      outgoingTransfersRef.current.forEach((state) => {
        pumpWindow(state);
      });
    };

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

    const handleError = (event: Event) => {
      console.error('[FileTransfer] data channel error', event);
      resetStateOnClose();
    };

    nextChannel.addEventListener('message', handleMessage);
    nextChannel.addEventListener('open', handleOpen);
    nextChannel.addEventListener('close', handleClose);
    nextChannel.addEventListener('error', handleError);
    nextChannel.addEventListener('bufferedamountlow', handleBufferedAmountLow);

    if (nextChannel.readyState === 'open') {
      pumpWindowForAll();
    }

    const cleanup = () => {
      nextChannel.removeEventListener('message', handleMessage);
      nextChannel.removeEventListener('open', handleOpen);
      nextChannel.removeEventListener('close', handleClose);
      nextChannel.removeEventListener('error', handleError);
      nextChannel.removeEventListener('bufferedamountlow', handleBufferedAmountLow);

      if (configuredChannelRef.current === nextChannel) {
        configuredChannelRef.current = null;
      }
    };

    channelCleanupRef.current = cleanup;

    return () => {
      cleanup();
      if (channelCleanupRef.current === cleanup) {
        channelCleanupRef.current = null;
      }
    };
  }, [channelRef, channel, handleMessage, pumpWindow, resetStateOnClose]);

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
    async (file: File, options: SendFileOptions = {}): Promise<string | null> => {
      const channel = channelRef.current;
      if (!channel || channel.readyState !== 'open') {
        console.warn('File transfer channel is not open');
        return null;
      }

      const id = createTransferId();
      const chunkSize = calculateChunkSize(file.size);
      const totalChunks = calculateTotalChunks(file.size, chunkSize);
      const startedAt = now();
      const displayName = options.displayName ?? file.name;

      const metadata: FileInitMessage = {
        type: 'file-init',
        id,
        name: displayName,
        mimeType: file.type,
        size: file.size,
        chunkSize,
        totalChunks,
        assetPath: options.assetPath,
      };

      const initialTransfer: FileTransfer = {
        id,
        name: displayName,
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
        assetPath: options.assetPath,
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

  const requestFile = useCallback(
    ({ assetPath, displayName }: Omit<FileRequestMessage, 'type'>) => {
      if (!assetPath) {
        return false;
      }

      return sendControlMessage({
        type: 'file-request',
        assetPath,
        displayName,
      });
    },
    [sendControlMessage],
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
      requestFile,
      cancelTransfer,
    }),
    [
      activeTransfers,
      cancelTransfer,
      completedTransfers,
      failedTransfers,
      requestFile,
      sendFile,
    ],
  );
};
