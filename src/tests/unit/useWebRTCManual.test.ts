import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/canvas/collaboration/manual-webrtc/usePeerConnection', () => {
  const React = require('react');
  const { useCallback, useEffect, useRef, useState } = React;

  type DataChannelHandler = ((channel: RTCDataChannel) => void) | null;

  return {
    SYNC_CHANNEL_LABEL: 'collab-sync',
    FILE_TRANSFER_CHANNEL_LABEL: 'collab-file-transfer',
    usePeerConnection() {
      const pcRef = useRef<RTCPeerConnection | null>(null);
      const syncChannelRef = useRef<RTCDataChannel | null>(
        (globalThis as any).__TEST_DATA_CHANNEL__ ?? null,
      );
      const fileTransferChannelRef = useRef<RTCDataChannel | null>(null);
      const [dataChannelState, setDataChannelState] = useState<'not-initiated' | 'open'>('not-initiated');
      const handlerRef = useRef<Map<string, DataChannelHandler>>(new Map());

      const setDataChannelHandler = useCallback(
        (label: string, handler: DataChannelHandler) => {
          if (handler) {
            handlerRef.current.set(label, handler);
          } else {
            handlerRef.current.delete(label);
          }

          if (label === 'collab-sync' && handler) {
            const channel = (globalThis as any).__TEST_DATA_CHANNEL__ ?? null;
            syncChannelRef.current = channel;
            if (channel) {
              handler(channel);
            }
          }

          if (label === 'collab-file-transfer' && handler && fileTransferChannelRef.current) {
            handler(fileTransferChannelRef.current);
          }
        },
        [],
      );

      const clearDataChannel = useCallback((label: string) => {
        if (label === 'collab-sync') {
          syncChannelRef.current = null;
        }

        if (label === 'collab-file-transfer') {
          fileTransferChannelRef.current = null;
        }
      }, []);

      const noopAsync = async () => '';
      const noop = () => {};

      return {
        pcRef,
        syncChannelRef,
        fileTransferChannelRef,
        localOffer: '',
        localAnswer: '',
        localCandidates: [] as string[],
        connectionState: 'new' as const,
        dataChannelState,
        setDataChannelState,
        createOffer: noopAsync,
        setRemoteOffer: noop,
        createAnswer: noopAsync,
        setRemoteAnswer: noop,
        addCandidate: noop,
        setDataChannelHandler,
        clearDataChannel,
      } as const;
    },
    usePeerConnectionDataChannel(
      label: string,
      setHandler: (label: string, handler: ((channel: RTCDataChannel) => void) | null) => void,
      setup: (channel: RTCDataChannel) => void,
    ) {
      const React = require('react');
      const { useEffect } = React;
      useEffect(() => {
        setHandler(label, setup);

        if (label === 'collab-sync') {
          const channel = (globalThis as any).__TEST_DATA_CHANNEL__ ?? null;
          if (channel) {
            setup(channel);
          }
        }

        return () => setHandler(label, null);
      }, [label, setHandler, setup]);
    },
  };
});

vi.mock(
  '../../core/canvas/collaboration/manual-webrtc/file-transfer/useFileTransferChannel',
  () => {
    return {
      useFileTransferChannel: () => ({
        activeTransfers: [],
        completedTransfers: [],
        failedTransfers: [],
        sendFile: vi.fn().mockResolvedValue(null),
        requestFile: vi.fn().mockReturnValue(true),
        cancelTransfer: vi.fn(),
      }),
    };
  },
);

vi.mock('../../core/diagnostics/StatsForNerdsContext', () => ({
  useStatsForNerds: () => ({
    setDataChannelBufferedAmount: vi.fn(),
    recordYjsOutbound: vi.fn(),
    recordYjsInbound: vi.fn(),
    recordFileTransferOutbound: vi.fn(),
    recordFileTransferInbound: vi.fn(),
    setYjsQueueSnapshot: vi.fn(),
    setFileTransferQueueSnapshot: vi.fn(),
  }),
}));

import { act, renderHook } from '@testing-library/react';
import * as Y from 'yjs';

import type { ChannelMessage } from '../../core/canvas/collaboration/manual-webrtc/types';
import { useWebRTCManual } from '../../core/canvas/collaboration/useWebRTCManual';
import * as useYjsSyncModule from '../../core/canvas/collaboration/manual-webrtc/useYjsSync';

type FakeRTCDataChannel = {
  readyState: RTCDataChannelState;
  bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  binaryType: BinaryType;
  send: (data: string) => void;
  close: () => void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  dispatchEvent: (type: string) => void;
};

declare global {
   
  var __TEST_DATA_CHANNEL__: FakeRTCDataChannel | null;
}

const createMockDataChannel = (): FakeRTCDataChannel => {
  const listeners = new Map<string, Set<EventListener>>();

  return {
    readyState: 'open',
    bufferedAmount: 0,
    bufferedAmountLowThreshold: 0,
    binaryType: 'arraybuffer',
    send: () => {},
    close: () => {},
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    addEventListener(type: string, listener: EventListener) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(type: string) {
      listeners.get(type)?.forEach((listener) => {
        listener(new Event(type));
      });
    },
  };
};

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('useWebRTCManual send failure handling', () => {
  let useYjsSyncSpy: ReturnType<typeof vi.spyOn> | undefined;
  const sendStateVectorSpy = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    sendStateVectorSpy.mockClear();
    const original = useYjsSyncModule.useYjsSync;
    useYjsSyncSpy = vi.spyOn(useYjsSyncModule, 'useYjsSync').mockImplementation((params) => {
      const actual = original(params);
      return {
        ...actual,
        sendStateVector: () => {
          sendStateVectorSpy();
          actual.sendStateVector();
        },
      };
    });
  });

  afterEach(() => {
    useYjsSyncSpy?.mockRestore();
    useYjsSyncSpy = undefined;
    globalThis.__TEST_DATA_CHANNEL__ = null;
    vi.useRealTimers();
  });

  it('retries updates and marks resync after InvalidStateError', async () => {
    const channel = createMockDataChannel();
    const sendMock = vi
      .fn<(data: string) => void>()
      .mockImplementationOnce(() => {
        // Initial state vector send succeeds.
      })
      .mockImplementationOnce(() => {
        throw new DOMException('Simulated failure', 'InvalidStateError');
      })
      .mockImplementation(() => {
        // Subsequent sends succeed.
      });

    channel.send = sendMock;
    globalThis.__TEST_DATA_CHANNEL__ = channel;

    const doc = new Y.Doc();
    const { result } = renderHook(() => useWebRTCManual(doc));
    void result;

    await act(async () => {
      channel.onopen?.();
    });

    expect(sendStateVectorSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      channel.onopen?.();
    });
    expect(sendStateVectorSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      doc.getText('test').insert(0, 'a');
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      await flushMicrotasks();
    });

    expect(sendMock).toHaveBeenCalledTimes(3);
    const failedPayload = sendMock.mock.calls[1]?.[0];
    const retriedPayload = sendMock.mock.calls[2]?.[0];
    expect(failedPayload).toBeDefined();
    expect(retriedPayload).toEqual(failedPayload);

    await act(async () => {
      channel.onopen?.();
    });

    expect(sendStateVectorSpy).toHaveBeenCalledTimes(2);
    expect(sendMock).toHaveBeenCalledTimes(4);

    const resyncPayload = sendMock.mock.calls[3]?.[0];
    const parsed = JSON.parse(resyncPayload) as ChannelMessage;
    expect(parsed.type).toBe('yjs-sync');
  });
});
