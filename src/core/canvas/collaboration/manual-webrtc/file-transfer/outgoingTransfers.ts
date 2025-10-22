import { getChunkBounds } from './chunking';
import { PendingChunkPacket } from './sendQueue';

export const MAX_IN_FLIGHT_CHUNKS = 16;
export const RETRY_INTERVAL_MS = 5_000;

export interface OutgoingTransferState {
  id: string;
  file: File;
  chunkSize: number;
  totalChunks: number;
  nextSequence: number;
  inFlight: Set<number>;
  pendingReads: Set<number>;
  bytesAcked: number;
  lastAckTime: number;
  retryTimer: ReturnType<typeof setInterval> | null;
  cancelled: boolean;
}

export const createOutgoingTransferState = (
  id: string,
  file: File,
  chunkSize: number,
  totalChunks: number,
  now: () => number,
): OutgoingTransferState => ({
  id,
  file,
  chunkSize,
  totalChunks,
  nextSequence: 0,
  inFlight: new Set(),
  pendingReads: new Set(),
  bytesAcked: 0,
  lastAckTime: now(),
  retryTimer: null,
  cancelled: false,
});

export const queueMissingChunks = async (
  state: OutgoingTransferState,
  missing: number[],
  encodeChunkFrame: (id: string, sequence: number, payload: ArrayBuffer) => ArrayBuffer,
  queuePacket: (packet: PendingChunkPacket) => void,
) => {
  if (missing.length === 0) {
    return;
  }

  for (const sequence of missing) {
    if (state.cancelled) {
      return;
    }

    if (state.pendingReads.has(sequence)) {
      continue;
    }

    state.pendingReads.add(sequence);
    try {
      const { start, end } = getChunkBounds(sequence, state.chunkSize, state.file.size);
      const slice = state.file.slice(start, end);
      const buffer = await slice.arrayBuffer();
      const frame = encodeChunkFrame(state.id, sequence, buffer);
      queuePacket({
        id: state.id,
        sequence,
        frame,
        size: buffer.byteLength,
      });
    } finally {
      state.pendingReads.delete(sequence);
    }
  }
};

export const pumpTransferWindow = async (
  state: OutgoingTransferState,
  encodeChunkFrame: (id: string, sequence: number, payload: ArrayBuffer) => ArrayBuffer,
  queuePacket: (packet: PendingChunkPacket) => void,
) => {
  if (state.cancelled) {
    return;
  }

  while (
    state.nextSequence < state.totalChunks &&
    state.inFlight.size < MAX_IN_FLIGHT_CHUNKS &&
    !state.cancelled
  ) {
    const sequence = state.nextSequence;
    state.nextSequence += 1;
    state.inFlight.add(sequence);

    if (state.pendingReads.has(sequence)) {
      continue;
    }

    state.pendingReads.add(sequence);
    try {
      const { start, end } = getChunkBounds(sequence, state.chunkSize, state.file.size);
      const slice = state.file.slice(start, end);
      const buffer = await slice.arrayBuffer();
      const frame = encodeChunkFrame(state.id, sequence, buffer);
      queuePacket({
        id: state.id,
        sequence,
        frame,
        size: buffer.byteLength,
      });
    } finally {
      state.pendingReads.delete(sequence);
    }
  }
};

export const startRetryTimer = (
  state: OutgoingTransferState,
  now: () => number,
  queueMissing: (state: OutgoingTransferState, missing: number[]) => void,
) => {
  if (state.retryTimer) {
    return;
  }

  state.retryTimer = setInterval(() => {
    if (state.cancelled) {
      return;
    }

    const outstanding = Array.from(state.inFlight.values());
    const stale = now() - state.lastAckTime > RETRY_INTERVAL_MS;
    if (outstanding.length === 0 || !stale) {
      return;
    }

    queueMissing(state, outstanding);
  }, RETRY_INTERVAL_MS);
};

export const stopRetryTimer = (state: OutgoingTransferState) => {
  if (state.retryTimer) {
    clearInterval(state.retryTimer);
    state.retryTimer = null;
  }
};
