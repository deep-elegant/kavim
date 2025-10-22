import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ConnectionState, DataChannelState } from "./types";

type DataChannelSetup = (channel: RTCDataChannel) => void;

export const SYNC_CHANNEL_LABEL = "collab-sync";
export const FILE_TRANSFER_CHANNEL_LABEL = "collab-file-transfer";
export type DataChannelLabel =
  | typeof SYNC_CHANNEL_LABEL
  | typeof FILE_TRANSFER_CHANNEL_LABEL;

/**
 * Handles RTCPeerConnection lifecycle for manual WebRTC setup.
 * - Creates/tears down peer connections
 * - Buffers ICE candidates until remote description is applied
 * - Exposes offer/answer helpers for manual signaling exchange
 * - Provides hook to hand configured data channel back to caller
 */
export function usePeerConnection() {
  const [localOffer, setLocalOffer] = useState<string>("");
  const [localAnswer, setLocalAnswer] = useState<string>("");
  const [localCandidates, setLocalCandidates] = useState<string[]>([]);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("new");
  const [dataChannelState, setDataChannelState] =
    useState<DataChannelState>("not-initiated");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const syncChannelRef = useRef<RTCDataChannel | null>(null);
  const fileTransferChannelRef = useRef<RTCDataChannel | null>(null);
  const candidatesBufferRef = useRef<RTCIceCandidate[]>([]);
  const dataChannelHandlersRef = useRef<
    Map<DataChannelLabel, DataChannelSetup | null>
  >(new Map());

  const channelRefs = useMemo(
    () =>
      new Map<DataChannelLabel, MutableRefObject<RTCDataChannel | null>>([
        [SYNC_CHANNEL_LABEL, syncChannelRef],
        [FILE_TRANSFER_CHANNEL_LABEL, fileTransferChannelRef],
      ]),
    [fileTransferChannelRef, syncChannelRef],
  );

  const applyChannelSetup = useCallback(
    (label: DataChannelLabel, channel: RTCDataChannel) => {
      const ref = channelRefs.get(label);
      if (ref) {
        ref.current = channel;
      }

      if (label === SYNC_CHANNEL_LABEL) {
        setDataChannelState(channel.readyState as DataChannelState);
      }

      dataChannelHandlersRef.current.get(label)?.(channel);
    },
    [channelRefs],
  );

  const initializePeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    syncChannelRef.current = null;
    fileTransferChannelRef.current = null;
    candidatesBufferRef.current = [];
    setLocalOffer("");
    setLocalAnswer("");
    setLocalCandidates([]);
    setDataChannelState("not-initiated");

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateStr = JSON.stringify(event.candidate.toJSON());
        setLocalCandidates((prev) => [...prev, candidateStr]);
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState as ConnectionState);
    };

    pcRef.current = pc;
    setConnectionState(pc.connectionState as ConnectionState);
    return pc;
  }, []);

  const createOffer = useCallback(async () => {
    const pc = initializePeerConnection();

    const syncChannel = pc.createDataChannel(SYNC_CHANNEL_LABEL);
    applyChannelSetup(SYNC_CHANNEL_LABEL, syncChannel);

    const fileTransferChannel = pc.createDataChannel(
      FILE_TRANSFER_CHANNEL_LABEL,
    );
    applyChannelSetup(FILE_TRANSFER_CHANNEL_LABEL, fileTransferChannel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const offerStr = JSON.stringify(pc.localDescription);
    setLocalOffer(offerStr);
    return offerStr;
  }, [applyChannelSetup, initializePeerConnection]);

  const setRemoteOffer = useCallback(
    async (offerJson: string) => {
      const pc = initializePeerConnection();

      pc.ondatachannel = (event) => {
        const { label } = event.channel;
        if (label === SYNC_CHANNEL_LABEL) {
          applyChannelSetup(SYNC_CHANNEL_LABEL, event.channel);
          return;
        }

        if (label === FILE_TRANSFER_CHANNEL_LABEL) {
          applyChannelSetup(FILE_TRANSFER_CHANNEL_LABEL, event.channel);
        }
      };

      const offer = JSON.parse(offerJson);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      for (const candidate of candidatesBufferRef.current) {
        await pc.addIceCandidate(candidate);
      }
      candidatesBufferRef.current = [];
    },
    [applyChannelSetup, initializePeerConnection],
  );

  const createAnswer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) {
      throw new Error("No peer connection. Set remote offer first.");
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const answerStr = JSON.stringify(pc.localDescription);
    setLocalAnswer(answerStr);
    return answerStr;
  }, []);

  const setRemoteAnswer = useCallback(async (answerJson: string) => {
    const pc = pcRef.current;
    if (!pc) {
      throw new Error("No peer connection. Create offer first.");
    }

    const answer = JSON.parse(answerJson);
    await pc.setRemoteDescription(new RTCSessionDescription(answer));

    for (const candidate of candidatesBufferRef.current) {
      await pc.addIceCandidate(candidate);
    }
    candidatesBufferRef.current = [];
  }, []);

  const addCandidate = useCallback(async (candidateJson: string) => {
    const pc = pcRef.current;
    if (!pc) {
      throw new Error("No peer connection initialized.");
    }

    const candidateObj = JSON.parse(candidateJson);
    const candidate = new RTCIceCandidate(candidateObj);

    if (pc.remoteDescription) {
      await pc.addIceCandidate(candidate);
      return;
    }

    candidatesBufferRef.current.push(candidate);
  }, []);

  const setDataChannelHandler = useCallback(
    (label: DataChannelLabel, handler: DataChannelSetup | null) => {
      if (handler) {
        dataChannelHandlersRef.current.set(label, handler);
      } else {
        dataChannelHandlersRef.current.delete(label);
      }

      const ref = channelRefs.get(label);
      const channel = ref?.current ?? null;
      if (handler && channel) {
        handler(channel);
      }
    },
    [channelRefs],
  );

  const clearDataChannel = useCallback(
    (label: DataChannelLabel) => {
      const ref = channelRefs.get(label);
      if (ref) {
        ref.current = null;
      }
    },
    [channelRefs],
  );

  return {
    pcRef,
    syncChannelRef,
    fileTransferChannelRef,
    localOffer,
    localAnswer,
    localCandidates,
    connectionState,
    dataChannelState,
    setDataChannelState,
    createOffer,
    setRemoteOffer,
    createAnswer,
    setRemoteAnswer,
    addCandidate,
    setDataChannelHandler,
    clearDataChannel,
  } as const;
}

export function usePeerConnectionDataChannel(
  label: DataChannelLabel,
  setHandler: (
    label: DataChannelLabel,
    handler: DataChannelSetup | null,
  ) => void,
  setup: DataChannelSetup,
) {
  useEffect(() => {
    setHandler(label, setup);
    return () => {
      setHandler(label, null);
    };
  }, [label, setHandler, setup]);
}
