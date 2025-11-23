import { Packr, unpack as msgpackUnpack } from "msgpackr";

/**
 * MessagePack serialization (msgpackr is required).
 * - We no longer fall back to JSON to avoid mixed-format .pak files.
 */

const packer = new Packr();

export const pack = (value: unknown) => packer.pack(value);
export const unpack = (buffer: Buffer) => msgpackUnpack(buffer);
