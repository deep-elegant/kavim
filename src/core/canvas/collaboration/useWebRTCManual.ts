import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import * as Y from 'yjs';

/**
 * Manual WebRTC hook for peer-to-peer collaboration.
 * - No signaling server: users manually exchange SDP and ICE candidates
 * - Syncs Yjs document updates over WebRTC data channel
 * - Handles presence data (cursors, selections, typing indicators)
 * - Chunks large messages to avoid WebRTC size limits
 */

type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
type DataChannelState =
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

// Yjs sync protocol messages
type SyncMessage = {
  type: 'yjs-sync';
  vector: string; // State vector for requesting missing updates
};

type YjsUpdateMessage = {
  type: 'yjs-update';
  update: string; // Base64-encoded Yjs update
};

// Large updates split into chunks to avoid WebRTC message size limits
type YjsUpdateChunkMessage = {
  type: 'yjs-update-chunk';
  id: string; // Unique ID to group chunks
  index: number;
  total: number;
  chunk: string;
};

type ChannelMessage =
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

// Encode in chunks to avoid stack overflow on large arrays
const BASE64_CHUNK_SIZE = 0x8000;

// WebRTC data channel has 16KB limit, stay under with overhead
const MAX_MESSAGE_CHUNK_SIZE = 15_000;

type PendingChunk = {
  total: number;
  received: number;
  parts: string[]; // Accumulated chunks
};

/**
 * Encode Uint8Array to base64 in chunks.
 * - Prevents stack overflow from String.fromCharCode(...largeArray)
 */
const encodeToBase64 = (bytes: Uint8Array): string => {
  if (bytes.length === 0) {
    return '';
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

/**
 * Decode base64 string back to Uint8Array.
 */
const decodeFromBase64 = (encoded: string): Uint8Array => {
  if (!encoded) {
    return new Uint8Array(0);
  }

  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export function useWebRTCManual(doc: Y.Doc) {
  // UI state for manual connection setup
  const [localOffer, setLocalOffer] = useState<string>('');
  const [localAnswer, setLocalAnswer] = useState<string>('');
  const [localCandidates, setLocalCandidates] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const [dataChannelState, setDataChannelState] = useState<DataChannelState>('not-initiated');
  const [messages, setMessages] = useState<WebRTCChatMessage[]>([]);
  const [remotePresenceByClient, setRemotePresenceByClient] = useState<
    Record<string, CursorPresence>
  >({});

  // WebRTC refs (persist across renders)
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  
  // Buffer ICE candidates until remote description is set
  const candidatesBuffer = useRef<RTCIceCandidate[]>([]);
  
  // Queue outgoing updates when channel not ready
  const pendingYUpdatesRef = useRef<Uint8Array[]>([]);
  
  // Reassemble chunked messages from remote peer
  const incomingChunksRef = useRef<Map<string, PendingChunk>>(new Map());
  
  // Batch local doc changes to reduce network chatter
  const pendingLocalUpdatesRef = useRef<Uint8Array[]>([]);
  const localFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Stable client ID for presence tracking
  const localClientKey = useMemo(() => String(doc.clientID), [doc]);
  const presenceMap = useMemo(() => doc.getMap<CursorPresence>('presence'), [doc]);

  /**
   * Send our current state vector to remote peer.
   * - Remote responds with missing updates we don't have
   * - Part of Yjs sync protocol
   */
  const sendStateVector = useCallback(() => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') {
      return;
    }

    const vector = encodeToBase64(Y.encodeStateVector(doc));
    const message: SyncMessage = { type: 'yjs-sync', vector };

    try {
      channel.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send state vector:', error);
    }
  }, [doc]);

  /**
   * Send a Yjs update to remote peer.
   * - Queues if channel not ready
   * - Chunks large updates to stay under WebRTC size limit
   * - Re-queues on send failure for retry
   */
  const sendYUpdate = useCallback((update: Uint8Array) => {
    const channel = dataChannelRef.current;
    const updateCopy = update.slice();

    // Queue for later if channel not open
    if (!channel || channel.readyState !== 'open') {
      pendingYUpdatesRef.current.push(updateCopy);
      return;
    }

    const encoded = encodeToBase64(updateCopy);

    const sendMessage = (message: ChannelMessage) => {
      try {
        channel.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Failed to send Yjs update message:', error);
        pendingYUpdatesRef.current.push(updateCopy);
        return false;
      }
    };

    // Small enough to send in one message
    if (encoded.length <= MAX_MESSAGE_CHUNK_SIZE) {
      void sendMessage({ type: 'yjs-update', update: encoded });
      return;
    }

    // Large update: split into chunks
    const chunkId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const totalChunks = Math.ceil(encoded.length / MAX_MESSAGE_CHUNK_SIZE);

    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * MAX_MESSAGE_CHUNK_SIZE;
      const end = start + MAX_MESSAGE_CHUNK_SIZE;
      const chunk = encoded.slice(start, end);
      const success = sendMessage({
        type: 'yjs-update-chunk',
        id: chunkId,
        index,
        total: totalChunks,
        chunk,
      });
      // Stop sending if one chunk fails (avoid partial state)
      if (!success) {
        break;
      }
    }
  }, []);

  /**
   * Send all queued Yjs updates when channel becomes ready.
   * - Called when data channel opens or reconnects
   */
  const flushPendingYUpdates = useCallback(() => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') {
      return;
    }

    if (pendingYUpdatesRef.current.length === 0) {
      return;
    }

    const updates = pendingYUpdatesRef.current;
    pendingYUpdatesRef.current = [];
    updates.forEach((update) => {
      sendYUpdate(update);
    });
  }, [sendYUpdate]);

  /**
   * Merge and send batched local document changes.
   * - Reduces network messages by combining rapid edits
   * - Merging multiple updates prevents redundant data
   */
  const flushLocalUpdates = useCallback(() => {
    if (pendingLocalUpdatesRef.current.length === 0) {
      return;
    }

    const updates = pendingLocalUpdatesRef.current;
    pendingLocalUpdatesRef.current = [];
    const mergedUpdate =
      updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);
    sendYUpdate(mergedUpdate);
  }, [sendYUpdate]);

  /**
   * Debounce local updates to batch rapid changes.
   * - 80ms window: balances responsiveness vs network efficiency
   */
  const scheduleLocalFlush = useCallback(() => {
    if (localFlushTimerRef.current !== null) {
      return;
    }

    localFlushTimerRef.current = setTimeout(() => {
      localFlushTimerRef.current = null;
      flushLocalUpdates();
    }, 80);
  }, [flushLocalUpdates]);

  /**
   * Apply received Yjs update to local document.
   * - Triggers React re-renders via Yjs observers
   */
  const applyYUpdate = useCallback((update: Uint8Array) => {
    try {
      Y.applyUpdate(doc, update, 'webrtc');
    } catch (error) {
      console.error('Failed to apply Yjs update:', error);
    }
  }, [doc]);

  /**
   * Handle incoming WebRTC data channel messages.
   * - Parses JSON and routes to appropriate handler
   * - Reassembles chunked Yjs updates
   * - Implements Yjs sync protocol (state vector exchange)
   */
  const handleStringMessage = useCallback((raw: string) => {
    let message: ChannelMessage;
    try {
      message = JSON.parse(raw) as ChannelMessage;
    } catch (error) {
      console.error('Failed to parse message:', error);
      return;
    }

    // Chat message for testing connection
    if (message.type === 'chat') {
      setMessages((prev) => [...prev, message]);
      return;
    }

    // State vector: remote peer requesting missing updates
    if (message.type === 'yjs-sync') {
      const remoteVector = decodeFromBase64(message.vector);
      const diff = Y.encodeStateAsUpdate(doc, remoteVector);
      if (diff.byteLength > 0) {
        sendYUpdate(diff); // Send what they're missing
      }
      flushPendingYUpdates(); // Also send queued updates
      return;
    }

    // Single Yjs update message
    if (message.type === 'yjs-update') {
      applyYUpdate(decodeFromBase64(message.update));
      return;
    }

    // Chunked Yjs update: reassemble before applying
    if (message.type === 'yjs-update-chunk') {
      const { id, index, total, chunk } = message;

      if (index < 0 || index >= total) {
        console.warn('Received Yjs chunk with invalid index', message);
        return;
      }

      let entry = incomingChunksRef.current.get(id);
      if (!entry || entry.total !== total) {
        entry = {
          total,
          received: 0,
          parts: new Array<string>(total),
        };
      }

      if (!entry) {
        return;
      }

      // Track this chunk (avoid duplicates)
      if (entry.parts[index] === undefined) {
        entry.parts[index] = chunk;
        entry.received += 1;
      }

      incomingChunksRef.current.set(id, entry);

      // All chunks received: reassemble and apply
      if (entry.received === entry.total) {
        incomingChunksRef.current.delete(id);
        const combined = entry.parts.join('');
        applyYUpdate(decodeFromBase64(combined));
      }
    }
  }, [applyYUpdate, doc, flushPendingYUpdates, sendYUpdate]);

  /**
   * Create new RTCPeerConnection with event handlers.
   * - Closes existing connection if retrying
   * - Resets signaling state for fresh start
   */
  const initializePeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    // Reset local signaling state for a clean retry
    setLocalOffer('');
    setLocalAnswer('');
    setLocalCandidates([]);
    candidatesBuffer.current = [];

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // Google's public STUN
    });

    // Collect ICE candidates for manual exchange
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const candidateStr = JSON.stringify(e.candidate.toJSON());
        setLocalCandidates(prev => [...prev, candidateStr]);
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState as ConnectionState);
      // console.log('🔌 Connection state:', pc.connectionState);

      if (pc.connectionState === 'connected') {
        // console.log('✅ WebRTC connection established successfully!');
      }
    };

    pcRef.current = pc;
    return pc;
  }, []);

  /**
   * Configure data channel for Yjs sync and presence updates.
   * - Binary mode for efficient Yjs updates
   * - Flushes queued updates when channel opens
   * - Clears state on close to prevent stale data
   */
  const setupDataChannel = useCallback((channel: RTCDataChannel) => {
    channel.binaryType = 'arraybuffer';
    setDataChannelState(channel.readyState as DataChannelState);

    channel.onopen = () => {
      setDataChannelState('open');
      sendStateVector(); // Request missing updates from peer
      flushLocalUpdates(); // Send our pending changes
      flushPendingYUpdates(); // Send queued remote updates
    };

    channel.onclose = () => {
      setDataChannelState('closed');
      setRemotePresenceByClient({}); // Clear collaborator cursors
      incomingChunksRef.current.clear();
      pendingYUpdatesRef.current = [];
    };

    channel.onmessage = (event) => {
      const { data } = event;

      // JSON messages (chat, sync, updates)
      if (typeof data === 'string') {
        handleStringMessage(data);
        return;
      }

      // Binary Yjs updates (for efficiency)
      if (data instanceof ArrayBuffer) {
        applyYUpdate(new Uint8Array(data));
        return;
      }

      if (data instanceof Blob) {
        data
          .arrayBuffer()
          .then((buffer) => {
            applyYUpdate(new Uint8Array(buffer));
          })
          .catch((error) => {
            console.error('Failed to read binary message:', error);
          });
        return;
      }

      if (ArrayBuffer.isView(data)) {
        const view = data as ArrayBufferView;
        applyYUpdate(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
        return;
      }

      console.warn('Received unsupported data channel message type:', data);
    };
  }, [
    applyYUpdate,
    flushLocalUpdates,
    flushPendingYUpdates,
    handleStringMessage,
    sendStateVector,
    setDataChannelState,
    setRemotePresenceByClient,
  ]);

  /**
   * Listen for local Yjs document changes and queue for sync.
   * - Ignores updates from WebRTC (prevent echo)
   * - Batches changes to reduce network traffic
   */
  useEffect(() => {
    const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'webrtc') {
        return; // Don't echo back updates we received
      }

      pendingLocalUpdatesRef.current.push(update.slice());
      scheduleLocalFlush();
    };

    doc.on('update', handleDocUpdate);

    return () => {
      doc.off('update', handleDocUpdate);
    };
  }, [doc, scheduleLocalFlush]);

  /**
   * Create WebRTC offer (initiator/host side).
   * - Creates data channel (initiator must create it)
   * - Waits for ICE candidate gathering
   * - Returns SDP offer as JSON string for manual exchange
   */
  const createOffer = useCallback(async () => {
    const pc = initializePeerConnection();

    // Initiator creates data channel
    const channel = pc.createDataChannel('chat');
    dataChannelRef.current = channel;
    setupDataChannel(channel);

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait a bit for ICE candidates to be gathered
    await new Promise(resolve => setTimeout(resolve, 1000));

    const offerStr = JSON.stringify(pc.localDescription);
    setLocalOffer(offerStr);
    return offerStr;
  }, [initializePeerConnection, setupDataChannel]);

  /**
   * Set remote offer (responder side).
   * - Waits for data channel to be created by initiator
   * - Applies buffered ICE candidates once remote description is set
   */
  const setRemoteOffer = useCallback(async (offerJson: string) => {
    const pc = initializePeerConnection();

    // Responder waits for data channel from initiator
    pc.ondatachannel = (e) => {
      const channel = e.channel;
      dataChannelRef.current = channel;
      setupDataChannel(channel);
    };

    const offer = JSON.parse(offerJson);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Apply buffered candidates now that remote description is set
    for (const candidate of candidatesBuffer.current) {
      await pc.addIceCandidate(candidate);
    }
    candidatesBuffer.current = [];
  }, [initializePeerConnection, setupDataChannel]);

  /**
   * Create WebRTC answer (responder side).
   * - Must be called after setRemoteOffer
   * - Returns SDP answer as JSON string for manual exchange
   */
  const createAnswer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) {
      throw new Error('No peer connection. Set remote offer first.');
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Wait for ICE candidates
    await new Promise(resolve => setTimeout(resolve, 1000));

    const answerStr = JSON.stringify(pc.localDescription);
    setLocalAnswer(answerStr);
    return answerStr;
  }, []);

  /**
   * Set remote answer (initiator side).
   * - Completes the offer/answer exchange
   * - Applies buffered ICE candidates
   */
  const setRemoteAnswer = useCallback(async (answerJson: string) => {
    const pc = pcRef.current;
    if (!pc) {
      throw new Error('No peer connection. Create offer first.');
    }

    const answer = JSON.parse(answerJson);
    await pc.setRemoteDescription(new RTCSessionDescription(answer));

    // Apply buffered candidates now that remote description is set
    for (const candidate of candidatesBuffer.current) {
      await pc.addIceCandidate(candidate);
    }
    candidatesBuffer.current = [];
  }, []);

  /**
   * Add ICE candidate from remote peer.
   * - Buffers if remote description not yet set (timing issue)
   * - Helps establish optimal network path
   */
  const addCandidate = useCallback(async (candidateJson: string) => {
    const pc = pcRef.current;
    if (!pc) {
      throw new Error('No peer connection initialized.');
    }

    try {
      const candidateObj = JSON.parse(candidateJson);
      const candidate = new RTCIceCandidate(candidateObj);

      if (pc.remoteDescription) {
        await pc.addIceCandidate(candidate);
      } else {
        // Buffer candidates if remote description not set yet
        candidatesBuffer.current.push(candidate);
      }
    } catch (err) {
      console.error('Failed to add ICE candidate:', err);
      throw err;
    }
  }, []);

  /**
   * Send chat message (for testing connection).
   * - Returns false if channel not ready
   */
  const sendMessage = useCallback((message: WebRTCChatMessage) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') {
      console.warn('Data channel not open');
      return false;
    }

    try {
      channel.send(JSON.stringify(message));
      setMessages(prev => [...prev, message]);
      return true;
    } catch (err) {
      console.error('Failed to send message:', err);
      return false;
    }
  }, []);

  /**
   * Update local user's presence data (cursor, selection, typing).
   * - Stored in Yjs map for automatic sync to peers
   * - Merges with existing presence to preserve unspecified fields
   * - Transacted to avoid multiple sync events
   */
  const updatePresence = useCallback(
    (update: Partial<Omit<CursorPresence, 'updatedAt'>>) => {
      doc.transact(() => {
        const existing = presenceMap.get(localClientKey);
        const hasNewPosition =
          typeof update.x === 'number' && typeof update.y === 'number';
        const nextHasPosition =
          typeof update.hasPosition === 'boolean'
            ? update.hasPosition
            : hasNewPosition
              ? true
              : existing?.hasPosition ?? false;
        const next: CursorPresence = {
          x: hasNewPosition ? update.x! : existing?.x ?? 0,
          y: hasNewPosition ? update.y! : existing?.y ?? 0,
          nodeId: update.nodeId ?? existing?.nodeId ?? null,
          interaction: update.interaction ?? existing?.interaction ?? 'pointer',
          hasPosition: nextHasPosition,
          updatedAt: Date.now(),
        };

        presenceMap.set(localClientKey, next);
      }, 'presence'); // Origin tag to identify presence updates

      return true;
    },
    [doc, localClientKey, presenceMap],
  );

  /**
   * Subscribe to remote collaborator presence changes.
   * - Updates React state when presence map changes
   * - Filters out local user's own presence
   */
  useEffect(() => {
    const updateRemotePresence = () => {
      const nextPresence: Record<string, CursorPresence> = {};

      presenceMap.forEach((value, key) => {
        if (key === localClientKey || !value) {
          return; // Skip own presence
        }

        nextPresence[key] = value;
      });

      setRemotePresenceByClient(nextPresence);
    };

    const observer = (event: Y.YMapEvent<CursorPresence>) => {
      void event;
      updateRemotePresence();
    };

    updateRemotePresence();
    presenceMap.observe(observer);

    return () => {
      presenceMap.unobserve(observer);
    };
  }, [localClientKey, presenceMap]);

  /**
   * Cleanup presence on unmount.
   * - Removes user from presence map so peers know they left
   */
  useEffect(() => () => {
    doc.transact(() => {
      presenceMap.delete(localClientKey);
    }, 'presence');
  }, [doc, localClientKey, presenceMap]);

  /**
   * Cleanup on unmount.
   * - Flushes pending updates before closing
   * - Closes WebRTC connections gracefully
   */
  useEffect(() => {
    return () => {
      if (localFlushTimerRef.current !== null) {
        clearTimeout(localFlushTimerRef.current);
        localFlushTimerRef.current = null;
      }

      flushLocalUpdates();
      if (dataChannelRef.current) {
        dataChannelRef.current.close();
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
      incomingChunksRef.current.clear();
      pendingYUpdatesRef.current = [];
    };
  }, [flushLocalUpdates]);

  return {
    createOffer,
    setRemoteOffer,
    createAnswer,
    setRemoteAnswer,
    addCandidate,
    sendMessage,
    updatePresence,
    localOffer,
    localAnswer,
    localCandidates,
    connectionState,
    dataChannelState,
    messages,
    remotePresenceByClient,
  };
}
