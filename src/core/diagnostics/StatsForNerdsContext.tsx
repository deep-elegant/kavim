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

type StatsForNerdsContextValue = {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  recordSetNodesInvocation: () => void;
  history: number[];
  latestRate: number;
  averageRate: number;
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

export const StatsForNerdsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [enabled, setEnabledState] = useState<boolean>(() => readInitialEnabled());
  const [history, setHistory] = useState<number[]>([]);
  const pendingCountRef = useRef(0);
  const intervalRef = useRef<number | null>(null);

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
      pendingCountRef.current = 0;
      setHistory([]);
      return;
    }

    const id = window.setInterval(() => {
      setHistory((previous) => {
        const next = [...previous, pendingCountRef.current];
        pendingCountRef.current = 0;
        if (next.length > HISTORY_LENGTH) {
          next.shift();
        }
        return next;
      });
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
    pendingCountRef.current += 1;
  }, [enabled]);

  const latestRate = history.at(-1) ?? 0;
  const averageRate = useMemo(() => {
    if (history.length === 0) {
      return 0;
    }
    const total = history.reduce((sum, value) => sum + value, 0);
    return total / history.length;
  }, [history]);

  const value = useMemo<StatsForNerdsContextValue>(
    () => ({
      enabled,
      setEnabled,
      recordSetNodesInvocation,
      history,
      latestRate,
      averageRate,
    }),
    [averageRate, enabled, history, latestRate, recordSetNodesInvocation, setEnabled],
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
