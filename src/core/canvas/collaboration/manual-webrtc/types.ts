export type ConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export type DataChannelState =
  | 'not-initiated'
  | 'connecting'
  | 'open'
  | 'closing'
  | 'closed';

export interface WebRTCChatMessage {
  type: 'chat';
  data: string;
  timestamp: number;
}

export type SyncMessage = {
  type: 'yjs-sync';
  vector: string;
};

export type YjsUpdateMessage = {
  type: 'yjs-update';
  update: string;
};

export type YjsUpdateChunkMessage = {
  type: 'yjs-update-chunk';
  id: string;
  index: number;
  total: number;
  chunk: string;
};

export type ChannelMessage =
  | WebRTCChatMessage
  | SyncMessage
  | YjsUpdateMessage
  | YjsUpdateChunkMessage;

export type CollaboratorInteraction = 'pointer' | 'selecting' | 'typing';

export type CursorPresence = {
  x: number;
  y: number;
  updatedAt: number;
  nodeId?: string | null;
  interaction?: CollaboratorInteraction;
  hasPosition?: boolean;
};

export const MAX_MESSAGE_CHUNK_SIZE = 15_000;
export const DATA_CHANNEL_MAX_BUFFER = 256_000;
export const DATA_CHANNEL_RESUME_THRESHOLD = 128_000;
