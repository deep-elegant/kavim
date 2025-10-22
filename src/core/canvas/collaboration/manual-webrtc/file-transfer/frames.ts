import { FILE_CHUNK_FRAME_TYPE, FileChunkFrame } from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const encodeChunkFrame = (id: string, sequence: number, payload: ArrayBuffer) => {
  const idBytes = encoder.encode(id);
  if (idBytes.length > 255) {
    throw new Error('Transfer identifier is too long to encode.');
  }

  const headerSize = 1 + 1 + idBytes.length + 4;
  const buffer = new ArrayBuffer(headerSize + payload.byteLength);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  let offset = 0;
  view.setUint8(offset, FILE_CHUNK_FRAME_TYPE);
  offset += 1;
  view.setUint8(offset, idBytes.length);
  offset += 1;
  uint8.set(idBytes, offset);
  offset += idBytes.length;
  view.setUint32(offset, sequence);
  offset += 4;

  uint8.set(new Uint8Array(payload), offset);
  return buffer;
};

export const decodeChunkFrame = async (data: ArrayBuffer | Blob): Promise<FileChunkFrame | null> => {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const view = new DataView(buffer);

  if (view.byteLength < 6) {
    return null;
  }

  let offset = 0;
  const type = view.getUint8(offset);
  offset += 1;
  if (type !== FILE_CHUNK_FRAME_TYPE) {
    return null;
  }

  const idLength = view.getUint8(offset);
  offset += 1;

  if (view.byteLength < offset + idLength + 4) {
    return null;
  }

  const idBytes = new Uint8Array(buffer, offset, idLength);
  offset += idLength;
  const id = decoder.decode(idBytes);
  const sequence = view.getUint32(offset);
  offset += 4;

  const payload = buffer.slice(offset);
  return { id, sequence, payload } satisfies FileChunkFrame;
};
