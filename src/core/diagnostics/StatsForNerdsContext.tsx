import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const LOCAL_STORAGE_KEY = 'app.statsForNerds.enabled';
const HISTORY_LENGTH = 60;

type MetricSeries = {
  history: number[];
  latest: number;
  average: number;
};

export type StatsForNerdsMetrics = {
  setNodesPerSecond: MetricSeries;
  yjsOutboundBytesPerSecond: MetricSeries;
  yjsInboundBytesPerSecond: MetricSeries;
  fileOutboundBytesPerSecond: MetricSeries;
  fileInboundBytesPerSecond: MetricSeries;
  yjsOutboundUpdatesPerSecond: MetricSeries;
  yjsInboundUpdatesPerSecond: MetricSeries;
  yjsQueueLength: MetricSeries;
  yjsQueueBytes: MetricSeries;
  dataChannelBufferedAmount: MetricSeries;
};

type StatsForNerdsContextValue = {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  recordSetNodesInvocation: () => void;
  recordYjsOutbound: (bytes: number) => void;
  recordYjsInbound: (bytes: number) => void;
  recordFileTransferOutbound: (bytes: number) => void;
  recordFileTransferInbound: (bytes: number) => void;
  setYjsQueueSnapshot: (length: number, totalBytes: number) => void;
  setDataChannelBufferedAmount: (amount: number) => void;
  metrics: StatsForNerdsMetrics;
};

const StatsForNerdsContext = createContext<StatsForNerdsContextValue | undefined>(
  undefined,
);

const readInitialEnabled = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored === 'true';
  } catch (error) {
    console.warn('Unable to read stats preference from storage', error);
    return false;
  }
};

const pushManyCapped = (history: number[], samples: number[]) => {
  if (samples.length === 0) {
    return history.length > HISTORY_LENGTH ? history.slice(-HISTORY_LENGTH) : history;
  }

  const combined = [...history, ...samples];
  return combined.length > HISTORY_LENGTH ? combined.slice(-HISTORY_LENGTH) : combined;
};

const pushCapped = (history: number[], value: number) => pushManyCapped(history, [value]);

const createEmptyHistories = () => ({
  setNodes: [] as number[],
  yjsOutboundBytes: [] as number[],
  yjsInboundBytes: [] as number[],
  fileOutboundBytes: [] as number[],
  fileInboundBytes: [] as number[],
  yjsOutboundUpdates: [] as number[],
  yjsInboundUpdates: [] as number[],
  yjsQueueLength: [] as number[],
  yjsQueueBytes: [] as number[],
  dataChannelBufferedAmount: [] as number[],
});

export const StatsForNerdsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [enabled, setEnabledState] = useState<boolean>(() => readInitialEnabled());
  const [histories, setHistories] = useState(createEmptyHistories);
  const countersRef = useRef({
    setNodes: 0,
    yjsOutboundBytes: 0,
    yjsInboundBytes: 0,
    fileOutboundBytes: 0,
    fileInboundBytes: 0,
    yjsOutboundUpdates: 0,
    yjsInboundUpdates: 0,
  });
  const intervalRef = useRef<number | null>(null);
  const lastSampleAtRef = useRef<number | null>(null);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, value ? 'true' : 'false');
      } catch (error) {
        console.warn('Unable to persist stats preference', error);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      lastSampleAtRef.current = null;
      countersRef.current = {
        setNodes: 0,
        yjsOutboundBytes: 0,
        yjsInboundBytes: 0,
        fileOutboundBytes: 0,
        fileInboundBytes: 0,
        yjsOutboundUpdates: 0,
        yjsInboundUpdates: 0,
      };
      setHistories(createEmptyHistories());
      return;
    }

    lastSampleAtRef.current = Date.now();

    const id = window.setInterval(() => {
      const {
        setNodes,
        yjsOutboundBytes,
        yjsInboundBytes,
        fileOutboundBytes,
        fileInboundBytes,
        yjsOutboundUpdates,
        yjsInboundUpdates,
      } = countersRef.current;

      const now = Date.now();
      const lastSampleAt = lastSampleAtRef.current ?? now;
      const elapsedMs = now - lastSampleAt;
      const skippedSeconds = Math.max(0, Math.floor(elapsedMs / 1000) - 1);
      const zeroSamples = skippedSeconds > 0 ? new Array(skippedSeconds).fill(0) : [];
      lastSampleAtRef.current = now;

      countersRef.current = {
        setNodes: 0,
        yjsOutboundBytes: 0,
        yjsInboundBytes: 0,
        fileOutboundBytes: 0,
        fileInboundBytes: 0,
        yjsOutboundUpdates: 0,
        yjsInboundUpdates: 0,
      };

      setHistories((previous) => ({
        ...previous,
        setNodes: pushManyCapped(previous.setNodes, [...zeroSamples, setNodes]),
        yjsOutboundBytes: pushManyCapped(previous.yjsOutboundBytes, [
          ...zeroSamples,
          yjsOutboundBytes,
        ]),
        yjsInboundBytes: pushManyCapped(previous.yjsInboundBytes, [...zeroSamples, yjsInboundBytes]),
        fileOutboundBytes: pushManyCapped(previous.fileOutboundBytes, [
          ...zeroSamples,
          fileOutboundBytes,
        ]),
        fileInboundBytes: pushManyCapped(previous.fileInboundBytes, [
          ...zeroSamples,
          fileInboundBytes,
        ]),
        yjsOutboundUpdates: pushManyCapped(previous.yjsOutboundUpdates, [
          ...zeroSamples,
          yjsOutboundUpdates,
        ]),
        yjsInboundUpdates: pushManyCapped(previous.yjsInboundUpdates, [
          ...zeroSamples,
          yjsInboundUpdates,
        ]),
      }));
    }, 1000);

    intervalRef.current = id;

    return () => {
      window.clearInterval(id);
      intervalRef.current = null;
    };
  }, [enabled]);

  const recordSetNodesInvocation = useCallback(() => {
    if (!enabled) {
      return;
    }
    countersRef.current.setNodes += 1;
  }, [enabled]);

  const recordYjsOutbound = useCallback(
    (bytes: number) => {
      if (!enabled) {
        return;
      }
      countersRef.current.yjsOutboundBytes += bytes;
      countersRef.current.yjsOutboundUpdates += 1;
    },
    [enabled],
  );

  const recordYjsInbound = useCallback(
    (bytes: number) => {
      if (!enabled) {
        return;
      }
      countersRef.current.yjsInboundBytes += bytes;
      countersRef.current.yjsInboundUpdates += 1;
    },
    [enabled],
  );

  const recordFileTransferOutbound = useCallback(
    (bytes: number) => {
      if (!enabled) {
        return;
      }
      countersRef.current.fileOutboundBytes += bytes;
    },
    [enabled],
  );

  const recordFileTransferInbound = useCallback(
    (bytes: number) => {
      if (!enabled) {
        return;
      }
      countersRef.current.fileInboundBytes += bytes;
    },
    [enabled],
  );

  const setYjsQueueSnapshot = useCallback(
    (length: number, totalBytes: number) => {
      if (!enabled) {
        return;
      }
      setHistories((previous) => ({
        ...previous,
        yjsQueueLength: pushCapped(previous.yjsQueueLength, length),
        yjsQueueBytes: pushCapped(previous.yjsQueueBytes, totalBytes),
      }));
    },
    [enabled],
  );

  const setDataChannelBufferedAmount = useCallback(
    (amount: number) => {
      if (!enabled) {
        return;
      }
      setHistories((previous) => ({
        ...previous,
        dataChannelBufferedAmount: pushCapped(previous.dataChannelBufferedAmount, amount),
      }));
    },
    [enabled],
  );

  const metrics = useMemo<StatsForNerdsMetrics>(() => {
    const toSeries = (history: number[]): MetricSeries => ({
      history,
      latest: history.at(-1) ?? 0,
      average:
        history.length > 0
          ? history.reduce((sum, value) => sum + value, 0) / history.length
          : 0,
    });

    return {
      setNodesPerSecond: toSeries(histories.setNodes),
      yjsOutboundBytesPerSecond: toSeries(histories.yjsOutboundBytes),
      yjsInboundBytesPerSecond: toSeries(histories.yjsInboundBytes),
      fileOutboundBytesPerSecond: toSeries(histories.fileOutboundBytes),
      fileInboundBytesPerSecond: toSeries(histories.fileInboundBytes),
      yjsOutboundUpdatesPerSecond: toSeries(histories.yjsOutboundUpdates),
      yjsInboundUpdatesPerSecond: toSeries(histories.yjsInboundUpdates),
      yjsQueueLength: toSeries(histories.yjsQueueLength),
      yjsQueueBytes: toSeries(histories.yjsQueueBytes),
      dataChannelBufferedAmount: toSeries(histories.dataChannelBufferedAmount),
    };
  }, [histories]);

  const value = useMemo<StatsForNerdsContextValue>(
    () => ({
      enabled,
      setEnabled,
      recordSetNodesInvocation,
      recordYjsOutbound,
      recordYjsInbound,
      recordFileTransferOutbound,
      recordFileTransferInbound,
      setYjsQueueSnapshot,
      setDataChannelBufferedAmount,
      metrics,
    }),
    [
      enabled,
      metrics,
      recordSetNodesInvocation,
      recordYjsInbound,
      recordFileTransferInbound,
      recordFileTransferOutbound,
      recordYjsOutbound,
      setDataChannelBufferedAmount,
      setEnabled,
      setYjsQueueSnapshot,
    ],
  );

  return (
    <StatsForNerdsContext.Provider value={value}>
      {children}
    </StatsForNerdsContext.Provider>
  );
};

export const useStatsForNerds = () => {
  const context = useContext(StatsForNerdsContext);
  if (!context) {
    throw new Error('useStatsForNerds must be used within StatsForNerdsProvider');
  }
  return context;
};
