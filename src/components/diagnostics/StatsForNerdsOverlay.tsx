import React, { useMemo } from 'react';
import { useStatsForNerds } from '@/core/diagnostics/StatsForNerdsContext';

const GRAPH_WIDTH = 200;
const GRAPH_HEIGHT = 80;

export const StatsForNerdsOverlay: React.FC = () => {
  const { enabled, history, latestRate, averageRate } = useStatsForNerds();

  const { points, maxValue } = useMemo(() => {
    if (history.length === 0) {
      return { points: '', maxValue: 0 };
    }

    const max = Math.max(1, ...history);
    const xStep = history.length > 1 ? GRAPH_WIDTH / (history.length - 1) : 0;
    const computedPoints = history
      .map((value, index) => {
        const x = Math.round(index * xStep);
        const y = Math.round(
          GRAPH_HEIGHT - (value / max) * GRAPH_HEIGHT,
        );
        return `${x},${y}`;
      })
      .join(' ');

    return { points: computedPoints, maxValue: max };
  }, [history]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-20 w-64 text-xs text-foreground">
      <div className="pointer-events-auto space-y-2 rounded-lg border border-border bg-background/90 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          <span>Stats for nerds</span>
          <span>setNodes/sec</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[0.65rem] uppercase text-muted-foreground">Last second</div>
            <div className="text-sm font-semibold">{latestRate}</div>
          </div>
          <div>
            <div className="text-[0.65rem] uppercase text-muted-foreground">Avg (last {history.length || 0}s)</div>
            <div className="text-sm font-semibold">{averageRate.toFixed(1)}</div>
          </div>
        </div>
        <svg
          width={GRAPH_WIDTH}
          height={GRAPH_HEIGHT}
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          className="w-full"
        >
          <rect
            x="0"
            y="0"
            width={GRAPH_WIDTH}
            height={GRAPH_HEIGHT}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            opacity={0.2}
          />
          {points ? (
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <text
              x={GRAPH_WIDTH / 2}
              y={GRAPH_HEIGHT / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="currentColor"
              opacity={0.4}
            >
              Waiting for samples…
            </text>
          )}
          {maxValue > 0 ? (
            <text
              x={GRAPH_WIDTH - 4}
              y={12}
              textAnchor="end"
              className="fill-current text-[0.6rem]"
            >
              max {maxValue}
            </text>
          ) : null}
        </svg>
      </div>
    </div>
  );
};
