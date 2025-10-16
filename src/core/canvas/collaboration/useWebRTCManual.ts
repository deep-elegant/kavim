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

  // Create offer (User A)
  const createOffer = useCallback(async () => {
    const pc = initializePeerConnection();
    
    // Create data channel
    const channel = pc.createDataChannel('chat');
    dataChannelRef.current = channel;

    channel.onopen = () => {
      console.log('📡 Data channel open (Initiator)');
      setDataChannelState('open');
    };

    channel.onclose = () => {
      console.log('📡 Data channel closed (Initiator)');
      setDataChannelState('closed');
    };

    channel.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WebRTCMessage;
        setMessages(prev => [...prev, msg]);
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait a bit for ICE candidates to be gathered
    await new Promise(resolve => setTimeout(resolve, 1000));

    const offerStr = JSON.stringify(pc.localDescription);
    setLocalOffer(offerStr);
    return offerStr;
  }, [initializePeerConnection]);

  // Set remote offer (User B)
  const setRemoteOffer = useCallback(async (offerJson: string) => {
    const pc = initializePeerConnection();

    // Set up data channel handler
    pc.ondatachannel = (e) => {
      const channel = e.channel;
      dataChannelRef.current = channel;

      channel.onopen = () => {
        console.log('📡 Data channel open (Responder)');
        setDataChannelState('open');
      };

      channel.onclose = () => {
        console.log('📡 Data channel closed (Responder)');
        setDataChannelState('closed');
      };

      channel.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as WebRTCMessage;
          setMessages(prev => [...prev, msg]);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      };
    };

    const offer = JSON.parse(offerJson);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Apply buffered candidates
    for (const candidate of candidatesBuffer.current) {
      await pc.addIceCandidate(candidate);
    }
    candidatesBuffer.current = [];
  }, [initializePeerConnection]);

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
      setMessages(prev => [...prev, message]);
      return true;
    } catch (err) {
      console.error('Failed to send message:', err);
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
    localOffer,
    localAnswer,
    localCandidates,
    connectionState,
    dataChannelState,
    messages,
  };
}
