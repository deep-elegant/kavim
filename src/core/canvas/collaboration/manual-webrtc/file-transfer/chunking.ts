import { DATA_CHANNEL_MAX_BUFFER } from "../types";

const MIN_CHUNK_SIZE = 16_384; // 16 KiB
const TARGET_CHUNK_COUNT = 128;
const MAX_CHUNK_SIZE = Math.max(
  MIN_CHUNK_SIZE,
  Math.floor(DATA_CHANNEL_MAX_BUFFER / 2),
);

export const clampChunkSize = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return MIN_CHUNK_SIZE;
  }

  return Math.min(MAX_CHUNK_SIZE, Math.max(MIN_CHUNK_SIZE, Math.floor(value)));
};

export const calculateChunkSize = (fileSize: number) => {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return MIN_CHUNK_SIZE;
  }

  const ideal = Math.ceil(fileSize / TARGET_CHUNK_COUNT);
  return clampChunkSize(ideal);
};

export const calculateTotalChunks = (fileSize: number, chunkSize: number) => {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return 0;
  }

  const size = clampChunkSize(chunkSize);
  return Math.max(1, Math.ceil(fileSize / size));
};

export const getChunkBounds = (
  index: number,
  chunkSize: number,
  totalSize: number,
): { start: number; end: number } => {
  const size = clampChunkSize(chunkSize);
  const start = Math.max(0, Math.floor(index) * size);
  const end = Math.min(totalSize, start + size);
  return { start, end };
};
