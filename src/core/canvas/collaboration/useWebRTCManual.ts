import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import * as Y from 'yjs';

type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface WebRTCChatMessage {
  type: 'chat';
  data: string;
  timestamp: number;
}

type SyncMessage = {
  type: 'yjs-sync';
  vector: string;
};

type YjsUpdateMessage = {
  type: 'yjs-update';
  update: string;
};

type YjsUpdateChunkMessage = {
  type: 'yjs-update-chunk';
  id: string;
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

const BASE64_CHUNK_SIZE = 0x8000;
const MAX_MESSAGE_CHUNK_SIZE = 15_000;

type PendingChunk = {
  total: number;
  received: number;
  parts: string[];
};

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
  const [localOffer, setLocalOffer] = useState<string>('');
  const [localAnswer, setLocalAnswer] = useState<string>('');
  const [localCandidates, setLocalCandidates] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const [dataChannelState, setDataChannelState] = useState<'connecting' | 'open' | 'closing' | 'closed'>('closed');
  const [messages, setMessages] = useState<WebRTCChatMessage[]>([]);
  const [remotePresenceByClient, setRemotePresenceByClient] = useState<
    Record<string, CursorPresence>
  >({});

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const candidatesBuffer = useRef<RTCIceCandidate[]>([]);
  const pendingYUpdatesRef = useRef<Uint8Array[]>([]);
  const incomingChunksRef = useRef<Map<string, PendingChunk>>(new Map());
  const pendingLocalUpdatesRef = useRef<Uint8Array[]>([]);
  const localFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localClientKey = useMemo(() => String(doc.clientID), [doc]);
  const presenceMap = useMemo(() => doc.getMap<CursorPresence>('presence'), [doc]);

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

  const sendYUpdate = useCallback((update: Uint8Array) => {
    const channel = dataChannelRef.current;
    const updateCopy = update.slice();

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

    if (encoded.length <= MAX_MESSAGE_CHUNK_SIZE) {
      void sendMessage({ type: 'yjs-update', update: encoded });
      return;
    }

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
      if (!success) {
        break;
      }
    }
  }, []);

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

  const scheduleLocalFlush = useCallback(() => {
    if (localFlushTimerRef.current !== null) {
      return;
    }

    localFlushTimerRef.current = setTimeout(() => {
      localFlushTimerRef.current = null;
      flushLocalUpdates();
    }, 80);
  }, [flushLocalUpdates]);

  const applyYUpdate = useCallback((update: Uint8Array) => {
    try {
      Y.applyUpdate(doc, update, 'webrtc');
    } catch (error) {
      console.error('Failed to apply Yjs update:', error);
    }
  }, [doc]);

  const handleStringMessage = useCallback((raw: string) => {
    let message: ChannelMessage;
    try {
      message = JSON.parse(raw) as ChannelMessage;
    } catch (error) {
      console.error('Failed to parse message:', error);
      return;
    }

    if (message.type === 'chat') {
      setMessages((prev) => [...prev, message]);
      return;
    }

    if (message.type === 'yjs-sync') {
      const remoteVector = decodeFromBase64(message.vector);
      const diff = Y.encodeStateAsUpdate(doc, remoteVector);
      if (diff.byteLength > 0) {
        sendYUpdate(diff);
      }
      flushPendingYUpdates();
      return;
    }

    if (message.type === 'yjs-update') {
      applyYUpdate(decodeFromBase64(message.update));
      return;
    }

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

      if (entry.parts[index] === undefined) {
        entry.parts[index] = chunk;
        entry.received += 1;
      }

      incomingChunksRef.current.set(id, entry);

      if (entry.received === entry.total) {
        incomingChunksRef.current.delete(id);
        const combined = entry.parts.join('');
        applyYUpdate(decodeFromBase64(combined));
      }
    }
  }, [applyYUpdate, doc, flushPendingYUpdates, sendYUpdate]);

  // Initialize peer connection
  const initializePeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

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

  // Setup data channel with message handlers
  const setupDataChannel = useCallback((channel: RTCDataChannel) => {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      setDataChannelState('open');
      sendStateVector();
      flushLocalUpdates();
      flushPendingYUpdates();
    };

    channel.onclose = () => {
      setDataChannelState('closed');
      setRemotePresenceByClient({});
      incomingChunksRef.current.clear();
      pendingYUpdatesRef.current = [];
    };

    channel.onmessage = (event) => {
      const { data } = event;

      if (typeof data === 'string') {
        handleStringMessage(data);
        return;
      }

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
  }, [applyYUpdate, flushLocalUpdates, flushPendingYUpdates, handleStringMessage, sendStateVector]);

  useEffect(() => {
    const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'webrtc') {
        return;
      }

      pendingLocalUpdatesRef.current.push(update.slice());
      scheduleLocalFlush();
    };

    doc.on('update', handleDocUpdate);

    return () => {
      doc.off('update', handleDocUpdate);
    };
  }, [doc, scheduleLocalFlush]);

  // Create offer (User A)
  const createOffer = useCallback(async () => {
    const pc = initializePeerConnection();

    // Create data channel
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

  // Set remote offer (User B)
  const setRemoteOffer = useCallback(async (offerJson: string) => {
    const pc = initializePeerConnection();

    // Set up data channel handler
    pc.ondatachannel = (e) => {
      const channel = e.channel;
      dataChannelRef.current = channel;
      setupDataChannel(channel);
    };

    const offer = JSON.parse(offerJson);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Apply buffered candidates
    for (const candidate of candidatesBuffer.current) {
      await pc.addIceCandidate(candidate);
    }
    candidatesBuffer.current = [];
  }, [initializePeerConnection, setupDataChannel]);

  // Create answer (User B)
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

  // Set remote answer (User A)
  const setRemoteAnswer = useCallback(async (answerJson: string) => {
    const pc = pcRef.current;
    if (!pc) {
      throw new Error('No peer connection. Create offer first.');
    }

    const answer = JSON.parse(answerJson);
    await pc.setRemoteDescription(new RTCSessionDescription(answer));

    // Apply buffered candidates
    for (const candidate of candidatesBuffer.current) {
      await pc.addIceCandidate(candidate);
    }
    candidatesBuffer.current = [];
  }, []);

  // Add ICE candidate
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

  // Send message
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

  const updatePresence = useCallback(
    (update: Partial<Omit<CursorPresence, 'updatedAt'>>) => {
      doc.transact(() => {
        const existing = presenceMap.get(localClientKey);
        const hasNewPosition =
          typeof update.x === 'number' && typeof update.y === 'number';
        const next: CursorPresence = {
          x: hasNewPosition ? update.x! : existing?.x ?? 0,
          y: hasNewPosition ? update.y! : existing?.y ?? 0,
          nodeId: update.nodeId ?? existing?.nodeId ?? null,
          interaction: update.interaction ?? existing?.interaction ?? 'pointer',
          hasPosition: hasNewPosition ? true : existing?.hasPosition ?? false,
          updatedAt: Date.now(),
        };

        presenceMap.set(localClientKey, next);
      }, 'presence');

      return true;
    },
    [doc, localClientKey, presenceMap],
  );

  useEffect(() => {
    const updateRemotePresence = () => {
      const nextPresence: Record<string, CursorPresence> = {};

      presenceMap.forEach((value, key) => {
        if (key === localClientKey || !value) {
          return;
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

  useEffect(() => () => {
    doc.transact(() => {
      presenceMap.delete(localClientKey);
    }, 'presence');
  }, [doc, localClientKey, presenceMap]);

  // Cleanup
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
