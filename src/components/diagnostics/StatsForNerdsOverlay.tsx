import React, { useMemo } from 'react';
import { useStatsForNerds } from '@/core/diagnostics/StatsForNerdsContext';

const GRAPH_WIDTH = 200;
const GRAPH_HEIGHT = 80;

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toFixed(precision)} ${units[exponent]}`;
};

const createPolylinePoints = (history: number[], maxValue: number) => {
  if (history.length === 0) {
    return '';
  }

  const xStep = history.length > 1 ? GRAPH_WIDTH / (history.length - 1) : 0;

  return history
    .map((value, index) => {
      const x = Math.round(index * xStep);
      const normalized = maxValue === 0 ? 0 : value / maxValue;
      const y = Math.round(GRAPH_HEIGHT - normalized * GRAPH_HEIGHT);
      return `${x},${y}`;
    })
    .join(' ');
};

export const StatsForNerdsOverlay: React.FC = () => {
  const { enabled, metrics } = useStatsForNerds();

  const setNodesHistory = metrics.setNodesPerSecond.history;
  const setNodesGraph = useMemo(() => {
    if (setNodesHistory.length === 0) {
      return { points: '', maxValue: 0 };
    }

    const max = Math.max(1, ...setNodesHistory);
    return { points: createPolylinePoints(setNodesHistory, max), maxValue: max };
  }, [setNodesHistory]);

  const outboundHistory = metrics.yjsOutboundBytesPerSecond.history;
  const inboundHistory = metrics.yjsInboundBytesPerSecond.history;
  const throughputGraph = useMemo(() => {
    if (outboundHistory.length === 0 && inboundHistory.length === 0) {
      return { outbound: '', inbound: '', maxValue: 0 };
    }

    const max = Math.max(1, ...outboundHistory, ...inboundHistory);
    return {
      outbound: createPolylinePoints(outboundHistory, max),
      inbound: createPolylinePoints(inboundHistory, max),
      maxValue: max,
    };
  }, [inboundHistory, outboundHistory]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-20 w-72 max-w-[18rem] text-xs text-foreground">
      <div className="pointer-events-auto space-y-3 rounded-lg border border-border bg-background/90 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          <span>Stats for nerds</span>
          <span>setNodes/sec</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[0.65rem] uppercase text-muted-foreground">Last second</div>
            <div className="text-sm font-semibold">{metrics.setNodesPerSecond.latest}</div>
          </div>
          <div>
            <div className="text-[0.65rem] uppercase text-muted-foreground">
              Avg (last {metrics.setNodesPerSecond.history.length || 0}s)
            </div>
            <div className="text-sm font-semibold">
              {metrics.setNodesPerSecond.average.toFixed(1)}
            </div>
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
          {setNodesGraph.points ? (
            <polyline
              points={setNodesGraph.points}
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
          {setNodesGraph.maxValue > 0 ? (
            <text
              x={GRAPH_WIDTH - 4}
              y={12}
              textAnchor="end"
              className="fill-current text-[0.6rem]"
            >
              max {setNodesGraph.maxValue}
            </text>
          ) : null}
        </svg>

        <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          <span>Yjs throughput</span>
          <span>bytes/sec</span>
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
          {throughputGraph.maxValue > 0 ? (
            <>
              {throughputGraph.outbound && (
                <polyline
                  points={throughputGraph.outbound}
                  fill="none"
                  stroke="hsl(var(--chart-1, 198_93%_60%))"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {throughputGraph.inbound && (
                <polyline
                  points={throughputGraph.inbound}
                  fill="none"
                  stroke="hsl(var(--chart-2, 142_71%_45%))"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <text
                x={GRAPH_WIDTH - 4}
                y={12}
                textAnchor="end"
                className="fill-current text-[0.6rem]"
              >
                max {formatBytes(throughputGraph.maxValue)}/s
              </text>
            </>
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
        </svg>
        <div className="flex items-center gap-3 text-[0.65rem] uppercase text-muted-foreground">
          <div className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: 'hsl(var(--chart-1, 198_93%_60%))' }}
            />
            <span>Outbound</span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: 'hsl(var(--chart-2, 142_71%_45%))' }}
            />
            <span>Inbound</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[0.7rem]">
          <div>
            <div className="text-[0.6rem] uppercase text-muted-foreground">Outbound latest</div>
            <div className="font-semibold">
              {formatBytes(metrics.yjsOutboundBytesPerSecond.latest)}/s
            </div>
            <div className="text-[0.6rem] uppercase text-muted-foreground">Avg</div>
            <div className="font-semibold">
              {formatBytes(metrics.yjsOutboundBytesPerSecond.average)}/s
            </div>
          </div>
          <div>
            <div className="text-[0.6rem] uppercase text-muted-foreground">Inbound latest</div>
            <div className="font-semibold">
              {formatBytes(metrics.yjsInboundBytesPerSecond.latest)}/s
            </div>
            <div className="text-[0.6rem] uppercase text-muted-foreground">Avg</div>
            <div className="font-semibold">
              {formatBytes(metrics.yjsInboundBytesPerSecond.average)}/s
            </div>
          </div>
        </div>
        <div className="space-y-1 text-[0.7rem]">
          <div className="flex items-center justify-between">
            <span className="text-[0.6rem] uppercase text-muted-foreground">
              Pending queue
            </span>
            <span className="font-semibold">
              {metrics.yjsQueueLength.latest} msg · {formatBytes(metrics.yjsQueueBytes.latest)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[0.6rem] uppercase text-muted-foreground">
              RTC buffered amount
            </span>
            <span className="font-semibold">
              {formatBytes(metrics.dataChannelBufferedAmount.latest)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
