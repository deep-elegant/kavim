import { useState, useRef, useCallback, useEffect } from 'react';

type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface WebRTCMessage {
  type: 'chat' | 'mouse';
  data: string | { x: number; y: number };
  timestamp: number;
}

export function useWebRTCManual() {
  const [localOffer, setLocalOffer] = useState<string>('');
  const [localAnswer, setLocalAnswer] = useState<string>('');
  const [localCandidates, setLocalCandidates] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const [dataChannelState, setDataChannelState] = useState<'connecting' | 'open' | 'closing' | 'closed'>('closed');
  const [messages, setMessages] = useState<WebRTCMessage[]>([]);
  const [remoteMouse, setRemoteMouse] = useState<{ x: number; y: number } | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const candidatesBuffer = useRef<RTCIceCandidate[]>([]);

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
      console.log('🔌 Connection state:', pc.connectionState);
      
      if (pc.connectionState === 'connected') {
        console.log('✅ WebRTC connection established successfully!');
      }
    };

    pcRef.current = pc;
    return pc;
  }, []);

  // Setup data channel with message handlers
  const setupDataChannel = useCallback((channel: RTCDataChannel, role: 'initiator' | 'responder') => {
    channel.onopen = () => {
      console.log(`📡 Data channel open (${role})`);
      setDataChannelState('open');
    };

    channel.onclose = () => {
      console.log(`📡 Data channel closed (${role})`);
      setDataChannelState('closed');
      setRemoteMouse(null);
    };

    channel.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WebRTCMessage;
        
        // Handle mouse messages separately
        if (msg.type === 'mouse' && typeof msg.data !== 'string') {
          console.log('📍 Received mouse position:', msg.data);
          setRemoteMouse(msg.data);
        } else if (msg.type === 'chat') {
          setMessages(prev => [...prev, msg]);
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };
  }, []);

  // Create offer (User A)
  const createOffer = useCallback(async () => {
    const pc = initializePeerConnection();
    
    // Create data channel
    const channel = pc.createDataChannel('chat');
    dataChannelRef.current = channel;
    setupDataChannel(channel, 'initiator');

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
      setupDataChannel(channel, 'responder');
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
  const sendMessage = useCallback((message: WebRTCMessage) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') {
      console.warn('Data channel not open');
      return false;
    }

    try {
      channel.send(JSON.stringify(message));
      if (message.type === 'chat') {
        setMessages(prev => [...prev, message]);
      }
      return true;
    } catch (err) {
      console.error('Failed to send message:', err);
      return false;
    }
  }, []);

  // Send mouse position
  const sendMousePosition = useCallback((x: number, y: number) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') {
      return false;
    }

    try {
      const message: WebRTCMessage = {
        type: 'mouse',
        data: { x, y },
        timestamp: Date.now(),
      };
      channel.send(JSON.stringify(message));
      return true;
    } catch (err) {
      console.error('Failed to send mouse position:', err);
      return false;
    }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (dataChannelRef.current) {
        dataChannelRef.current.close();
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
    };
  }, []);

  return {
    createOffer,
    setRemoteOffer,
    createAnswer,
    setRemoteAnswer,
    addCandidate,
    sendMessage,
    sendMousePosition,
    localOffer,
    localAnswer,
    localCandidates,
    connectionState,
    dataChannelState,
    messages,
    remoteMouse,
  };
}
