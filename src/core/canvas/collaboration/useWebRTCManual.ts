import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import * as Y from 'yjs';

import type {
  ChannelMessage,
  ConnectionState,
  CursorPresence,
  DataChannelState,
  WebRTCChatMessage,
} from './manual-webrtc/types';
import {
  DATA_CHANNEL_MAX_BUFFER,
  DATA_CHANNEL_RESUME_THRESHOLD,
} from './manual-webrtc/types';
import { useYjsSync } from './manual-webrtc/useYjsSync';

export type {
  CollaboratorInteraction,
  CursorPresence,
  WebRTCChatMessage,
} from './manual-webrtc/types';

/**
 * Manual WebRTC hook for peer-to-peer collaboration.
 * - No signaling server: users manually exchange SDP and ICE candidates
 * - Syncs Yjs document updates over WebRTC data channel
 * - Handles presence data (cursors, selections, typing indicators)
 * - Chunks large messages to avoid WebRTC size limits
 */

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
  const isBufferDrainingRef = useRef(false);
  const flushPendingYUpdatesRef = useRef<() => void>(() => {});
  
  // Batch local doc changes to reduce network chatter
  const pendingLocalUpdatesRef = useRef<Uint8Array[]>([]);
  const localFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Stable client ID for presence tracking
  const localClientKey = useMemo(() => String(doc.clientID), [doc]);
  const presenceMap = useMemo(() => doc.getMap<CursorPresence>('presence'), [doc]);

  const scheduleBufferDrain = useCallback(() => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') {
      return;
    }

    if (channel.bufferedAmount <= DATA_CHANNEL_RESUME_THRESHOLD) {
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => {
          flushPendingYUpdatesRef.current();
        });
      } else {
        Promise.resolve().then(() => {
          flushPendingYUpdatesRef.current();
        });
      }
      return;
    }

    if (isBufferDrainingRef.current) {
      return;
    }

    isBufferDrainingRef.current = true;
  }, []);

  const sendJSONMessage = useCallback(
    (
      message: ChannelMessage,
      options: { onBackpressure?: () => void; context?: string } = {},
    ): boolean => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== 'open') {
        return false;
      }

      if (channel.bufferedAmount >= DATA_CHANNEL_MAX_BUFFER) {
        options.onBackpressure?.();
        scheduleBufferDrain();
        return false;
      }

      const serialized = JSON.stringify(message);

      try {
        channel.send(serialized);

        if (channel.bufferedAmount >= DATA_CHANNEL_MAX_BUFFER) {
          scheduleBufferDrain();
        }

        return true;
      } catch (error) {
        const isOperationError =
          error instanceof DOMException && error.name === 'OperationError';

        console.error(options.context ?? 'Failed to send data channel message:', error);

        if (isOperationError) {
          options.onBackpressure?.();
          scheduleBufferDrain();
        }

        return false;
      }
    },
    [scheduleBufferDrain],
  );

  const handleRemoteChatMessage = useCallback(
    (message: WebRTCChatMessage) => {
      setMessages((prev) => [...prev, message]);
    },
    [setMessages],
  );

  const {
    applyYUpdate,
    flushPendingYUpdates,
    handleStringMessage,
    resetPendingQueue,
    resetChunkAssembly,
    sendStateVector,
    sendYUpdate,
  } = useYjsSync({
    doc,
    dataChannelRef,
    onReceiveChatMessage: handleRemoteChatMessage,
    scheduleBufferDrain,
    sendJSONMessage,
  });

  useEffect(() => {
    flushPendingYUpdatesRef.current = flushPendingYUpdates;
    return () => {
      flushPendingYUpdatesRef.current = () => {};
    };
  }, [flushPendingYUpdates]);

  const handleBufferedAmountLow = useCallback(() => {
    isBufferDrainingRef.current = false;
    flushPendingYUpdates();
  }, [flushPendingYUpdates]);

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
    channel.bufferedAmountLowThreshold = DATA_CHANNEL_RESUME_THRESHOLD;
    channel.addEventListener('bufferedamountlow', handleBufferedAmountLow);
    setDataChannelState(channel.readyState as DataChannelState);

    channel.onopen = () => {
      setDataChannelState('open');
      isBufferDrainingRef.current = false;
      sendStateVector(); // Request missing updates from peer
      flushLocalUpdates(); // Send our pending changes
      flushPendingYUpdates(); // Send queued remote updates
    };

    channel.onclose = () => {
      setDataChannelState('closed');
      channel.removeEventListener('bufferedamountlow', handleBufferedAmountLow);
      isBufferDrainingRef.current = false;
      setRemotePresenceByClient({}); // Clear collaborator cursors
      resetChunkAssembly();
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
    handleBufferedAmountLow,
    handleStringMessage,
    resetChunkAssembly,
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
  const sendMessage = useCallback(
    (message: WebRTCChatMessage) => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== 'open') {
        console.warn('Data channel not open');
        return false;
      }

      const sent = sendJSONMessage(message, {
        context: 'Failed to send chat message',
      });

      if (sent) {
        setMessages(prev => [...prev, message]);
      }

      return sent;
    },
    [sendJSONMessage],
  );

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
      resetChunkAssembly();
      resetPendingQueue();
    };
  }, [flushLocalUpdates, resetChunkAssembly, resetPendingQueue]);

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
