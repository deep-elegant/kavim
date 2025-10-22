export type FileTransferDirection = 'incoming' | 'outgoing';

export type FileTransferStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface FileTransferMetadata {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
  chunkSize: number;
  totalChunks: number;
}

export interface FileTransferProgressSnapshot {
  id: string;
  direction: FileTransferDirection;
  status: FileTransferStatus;
  bytesTransferred: number;
  totalBytes: number;
  progress: number;
  updatedAt: number;
}

export interface FileTransfer extends FileTransferMetadata, FileTransferProgressSnapshot {
  startedAt: number;
  completedAt?: number;
  error?: string;
  payload?: Blob;
  originalFile?: File;
}

export interface FileInitMessage {
  type: 'file-init';
  id: string;
  name: string;
  size: number;
  mimeType?: string;
  chunkSize: number;
  totalChunks: number;
}

export interface FileAckMessage {
  type: 'file-ack';
  id: string;
  acked: number[];
  receivedBytes: number;
  receivedChunks: number;
  missing?: number[];
}

export interface FileCompleteMessage {
  type: 'file-complete';
  id: string;
}

export interface FileErrorMessage {
  type: 'file-error';
  id: string;
  reason: string;
}

export interface FileResendMessage {
  type: 'file-resend';
  id: string;
  missing: number[];
}

export type FileTransferControlMessage =
  | FileInitMessage
  | FileAckMessage
  | FileCompleteMessage
  | FileErrorMessage
  | FileResendMessage;

export const FILE_CHUNK_FRAME_TYPE = 0x1;
export const FILE_CHUNK_HEADER_SIZE = 2 + 4; // frame type + id length + sequence

export interface FileChunkFrame {
  id: string;
  sequence: number;
  payload: ArrayBuffer;
}
