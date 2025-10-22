 
 
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * MessagePack serialization with fallback to JSON.
 * - Uses msgpackr for efficient binary serialization when available.
 * - Falls back to JSON if msgpackr fails to load (missing dependency, etc.).
 * - Provides consistent pack/unpack API regardless of backend used.
 */

let packer: unknown = null;
let packFn: (value: unknown) => Buffer;
let unpackFn: (buffer: Buffer) => unknown;

try {
  const msgpackr = require("msgpackr") as {
    Packr: new () => { pack: (value: unknown) => Buffer };
    unpack: (buffer: Buffer) => unknown;
  };
  packer = new msgpackr.Packr();
  packFn = (value: unknown) => (packer as { pack: (value: unknown) => Buffer }).pack(value);
  unpackFn = (buffer: Buffer) => msgpackr.unpack(buffer);
} catch (error) {
  // Graceful degradation: JSON is less efficient but universally available
  console.warn(
    "msgpackr is not available; falling back to JSON serialization for pak index.",
    error,
  );
  packFn = (value: unknown) => Buffer.from(JSON.stringify(value), "utf-8");
  unpackFn = (buffer: Buffer) => JSON.parse(buffer.toString("utf-8")) as unknown;
}

export const pack = (value: unknown) => packFn(value);
export const unpack = (buffer: Buffer) => unpackFn(buffer);
