import { FileInitMessage } from './types';

export interface IncomingTransferState {
  id: string;
  name: string;
  mimeType?: string;
  size: number;
  chunkSize: number;
  totalChunks: number;
  assetPath?: string;
  receivedBytes: number;
  expectedSequence: number;
  chunks: Map<number, ArrayBuffer>;
  completed: boolean;
}

export const createIncomingTransferState = (message: FileInitMessage): IncomingTransferState => ({
  id: message.id,
  name: message.name,
  mimeType: message.mimeType,
  size: message.size,
  chunkSize: message.chunkSize,
  totalChunks: message.totalChunks,
  assetPath: message.assetPath,
  receivedBytes: 0,
  expectedSequence: 0,
  chunks: new Map(),
  completed: false,
});
