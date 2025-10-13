import React, {
  memo,
  useCallback,
  useMemo,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  useReactFlow,
  useStoreApi,
  type Edge,
  type EdgeProps,
  type XYPosition,
} from '@xyflow/react';

export type EditableEdgeData = {
  controlPoints: XYPosition[];
};

type EditableEdgeProps = EdgeProps<EditableEdgeData>;

type Point = XYPosition;

const DEFAULT_STROKE = '#2563eb';
const CONTROL_POINT_RADIUS = 6;
const CONTROL_POINT_HIT_RADIUS = 14;
const SPLINE_TENSION = 1;

const distanceBetween = (a: Point, b: Point) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const distancePointToSegment = (p: Point, a: Point, b: Point) => {
  const lengthSquared = Math.pow(distanceBetween(a, b), 2);
  if (lengthSquared === 0) {
    return distanceBetween(p, a);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / lengthSquared,
    ),
  );

  const projection = {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  } satisfies Point;

  return distanceBetween(p, projection);
};

const buildSmoothPath = (points: Point[]) => {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    const [point] = points;
    return `M${point.x},${point.y}`;
  }

  if (points.length === 2) {
    const [start, end] = points;
    return `M${start.x},${start.y} L${end.x},${end.y}`;
  }

  const pathCommands: string[] = [];
  pathCommands.push(`M${points[0].x},${points[0].y}`);

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * SPLINE_TENSION;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * SPLINE_TENSION;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * SPLINE_TENSION;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * SPLINE_TENSION;

    pathCommands.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`);
  }

  return pathCommands.join(' ');
};

const EditableEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    data,
    selected,
    style,
    markerStart,
    markerEnd,
    interactionWidth = 24,
  }: EditableEdgeProps) => {
    const { setEdges, screenToFlowPosition } = useReactFlow();
    const store = useStoreApi();

    const controlPoints = data?.controlPoints ?? [];

    const points = useMemo<Point[]>(
      () => [
        { x: sourceX, y: sourceY },
        ...controlPoints,
        { x: targetX, y: targetY },
      ],
      [sourceX, sourceY, targetX, targetY, controlPoints],
    );

    const path = useMemo(() => buildSmoothPath(points), [points]);

    const stroke = (style?.stroke as string | undefined) ?? DEFAULT_STROKE;
    const strokeWidthValue = Number(style?.strokeWidth ?? (selected ? 3 : 2));
    const strokeWidth = Number.isNaN(strokeWidthValue) ? 2 : strokeWidthValue;

    const updateControlPoints = useCallback(
      (updater: (current: XYPosition[]) => XYPosition[]) => {
        setEdges((currentEdges) =>
          currentEdges.map((edge) => {
            if (edge.id !== id) {
              return edge;
            }

            const currentPoints = edge.data?.controlPoints ?? [];
            return {
              ...edge,
              data: {
                ...edge.data,
                controlPoints: updater([...currentPoints]),
              },
            } satisfies Edge<EditableEdgeData>;
          }),
        );
      },
      [id, setEdges],
    );

    const handleControlPointerDown = useCallback(
      (event: ReactPointerEvent<SVGCircleElement>, index: number) => {
        event.stopPropagation();
        event.preventDefault();

        const pointerId = event.pointerId;
        const element = event.currentTarget;
        element.setPointerCapture(pointerId);

        const handlePointerMove = (moveEvent: PointerEvent) => {
          if (moveEvent.pointerId !== pointerId) {
            return;
          }

          const position = screenToFlowPosition({
            x: moveEvent.clientX,
            y: moveEvent.clientY,
          });

          updateControlPoints((current) =>
            current.map((point, pointIndex) =>
              pointIndex === index ? position : point,
            ),
          );
        };

        const handlePointerUp = (upEvent: PointerEvent) => {
          if (upEvent.pointerId !== pointerId) {
            return;
          }

          element.releasePointerCapture(pointerId);
          window.removeEventListener('pointermove', handlePointerMove);
          window.removeEventListener('pointerup', handlePointerUp);
          window.removeEventListener('pointercancel', handlePointerUp);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
      },
      [screenToFlowPosition, updateControlPoints],
    );

    const handleControlDoubleClick = useCallback(
      (event: ReactMouseEvent<SVGCircleElement>, index: number) => {
        event.stopPropagation();
        event.preventDefault();

        updateControlPoints((current) => current.filter((_, i) => i !== index));
      },
      [updateControlPoints],
    );

    const handlePathDoubleClick = useCallback(
      (event: ReactMouseEvent<SVGPathElement>) => {
        if (event.button !== 0) {
          return;
        }

        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        const segmentIndex = (() => {
          let bestIndex = 0;
          let bestDistance = Number.POSITIVE_INFINITY;

          for (let i = 0; i < points.length - 1; i += 1) {
            const segmentDistance = distancePointToSegment(
              position,
              points[i],
              points[i + 1],
            );

            if (segmentDistance < bestDistance) {
              bestDistance = segmentDistance;
              bestIndex = i;
            }
          }

          return Math.min(bestIndex, controlPoints.length);
        })();

        updateControlPoints((current) => {
          const next = [...current];
          next.splice(segmentIndex, 0, position);
          return next;
        });

        const { addSelectedEdges } = store.getState();
        addSelectedEdges([id]);
      },
      [controlPoints.length, id, points, screenToFlowPosition, store, updateControlPoints],
    );

    return (
      <g>
        <path
          className="react-flow__edge-path"
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerStart={markerStart}
          markerEnd={markerEnd}
          style={style}
        />
        <path
          className="react-flow__edge-interaction"
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={interactionWidth}
          onDoubleClick={handlePathDoubleClick}
          style={{ cursor: 'pointer' }}
        />
        {selected &&
          controlPoints.map((point, index) => (
            <g key={`${id}-control-${index}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r={CONTROL_POINT_HIT_RADIUS}
                fill="transparent"
                stroke="transparent"
                fillOpacity={0.001}
                pointerEvents="all"
                onPointerDown={(event) =>
                  handleControlPointerDown(event, index)
                }
                style={{ cursor: 'grab' }}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={CONTROL_POINT_RADIUS}
                fill="#ffffff"
                stroke={stroke}
                strokeWidth={2}
                onPointerDown={(event) =>
                  handleControlPointerDown(event, index)
                }
                onDoubleClick={(event) =>
                  handleControlDoubleClick(event, index)
                }
                style={{ cursor: 'grab' }}
              />
            </g>
          ))}
      </g>
    );
  },
);

EditableEdge.displayName = 'EditableEdge';

export default EditableEdge;
