import React, {
  memo,
  useCallback,
  useMemo,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  useReactFlow,
  useStoreApi,
  type Edge,
  type EdgeProps,
  type XYPosition,
  EdgeLabelRenderer,
} from "@xyflow/react";
import { ArrowLeft, ArrowRight, Minus } from "lucide-react";

import {
  TiptapToolbar,
  type ToolbarItem,
} from "@/components/ui/minimal-tiptap/TiptapToolbar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  SimpleColorPicker,
  type ColorStyle,
} from "@/components/ui/simple-color-picker";

/** Determines what to show at edge endpoints */
export type EdgeMarkerType = "none" | "arrow";

/** Visual style of the edge line */
export type EdgeLineStyle = "regular" | "dashed" | "bolder";

/** Data stored per edge for customization and spline control */
export type EditableEdgeData = {
  controlPoints: XYPosition[];
  sourceMarker?: EdgeMarkerType;
  targetMarker?: EdgeMarkerType;
  styleType?: EdgeLineStyle;
  color?: string;
};

type EditableEdgeProps = EdgeProps<EditableEdgeData>;

type Point = XYPosition;

const DEFAULT_STROKE = "#000000";
const DEFAULT_SOURCE_MARKER: EdgeMarkerType = "none";
const DEFAULT_TARGET_MARKER: EdgeMarkerType = "arrow"; // Default to forward arrowheads so new links show directionality immediately.
const DEFAULT_STYLE_TYPE: EdgeLineStyle = "regular";
const CONTROL_POINT_RADIUS = 6;
// Larger hit area makes control points easier to grab
const CONTROL_POINT_HIT_RADIUS = 14;
const SPLINE_TENSION = 1;
// Toolbar appears above the highest point of the edge
const EDGE_TOOLBAR_VERTICAL_OFFSET = 32;

// SVG paths for arrow markers pointing left and right
const ARROW_HEAD_LEFT = "M12,0 L12,12 L0,6 z";
const ARROW_HEAD_RIGHT = "M0,0 L0,12 L12,6 z";

/** Factory for initial edge data with sensible defaults */
export const createDefaultEditableEdgeData = (): EditableEdgeData => ({
  controlPoints: [],
  sourceMarker: DEFAULT_SOURCE_MARKER,
  targetMarker: DEFAULT_TARGET_MARKER,
  styleType: DEFAULT_STYLE_TYPE,
  color: DEFAULT_STROKE,
});

/** Euclidean distance between two points */
const distanceBetween = (a: Point, b: Point) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Shortest distance from point p to line segment a-b.
 * - Projects p onto the line, clamped to the segment.
 */
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

/**
 * Builds an SVG path for a smooth spline through the given points.
 * - Uses cubic Bezier curves (Catmull-Rom style) for smooth transitions.
 * - Handles edge cases (0, 1, or 2 points) with simpler paths.
 */
const buildSmoothPath = (points: Point[]) => {
  if (points.length === 0) {
    return "";
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

  return pathCommands.join(" ");
};

/**
 * Renders a customizable edge with smooth curves and interactive control points.
 * - Users can double-click the path to add control points.
 * - Control points are draggable when selected.
 * - Double-clicking a control point removes it.
 * - Toolbar shows styling options when edge is selected.
 */
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

    // Determine arrow icon orientation based on connection direction
    const isSourceLeft = sourceX < targetX;
    const [sourceMarkerPath, targetMarkerPath] = [
      ARROW_HEAD_LEFT,
      ARROW_HEAD_RIGHT,
    ];

    const controlPoints = data?.controlPoints ?? [];
    const sourceMarker = data?.sourceMarker ?? DEFAULT_SOURCE_MARKER;
    const targetMarker = data?.targetMarker ?? DEFAULT_TARGET_MARKER;
    const styleType = data?.styleType ?? DEFAULT_STYLE_TYPE;
    const edgeColor = data?.color ?? DEFAULT_STROKE;

    // Combine source, control points, and target into a single point list
    const points = useMemo<Point[]>(
      () => [
        { x: sourceX, y: sourceY },
        ...controlPoints,
        { x: targetX, y: targetY },
      ],
      [sourceX, sourceY, targetX, targetY, controlPoints],
    );

    const path = useMemo(() => buildSmoothPath(points), [points]);

    const showSourceArrow = sourceMarker === "arrow";
    const showTargetArrow = targetMarker === "arrow";
    const strokeDasharray = styleType === "dashed" ? "8 6" : undefined;
    const baseStrokeWidth = styleType === "bolder" ? 4 : 2;
    const strokeWidth = selected ? baseStrokeWidth + 1 : baseStrokeWidth;
    const markerStartId = `${id}-marker-start`;
    const markerEndId = `${id}-marker-end`;
    const markerStartUrl = showSourceArrow
      ? `url(#${markerStartId})`
      : undefined;
    const markerEndUrl = showTargetArrow ? `url(#${markerEndId})` : undefined;

    // Position toolbar above the highest point (or center if multiple at same height)
    const toolbarPosition = useMemo(() => {
      if (points.length === 0) {
        return { x: 0, y: 0 } satisfies XYPosition;
      }

      const highestBounds = points.reduce(
        (currentHighest, point) => {
          if (point.y < currentHighest.y) {
            return { y: point.y, minX: point.x, maxX: point.x };
          }

          if (point.y === currentHighest.y) {
            return {
              y: currentHighest.y,
              minX: Math.min(currentHighest.minX, point.x),
              maxX: Math.max(currentHighest.maxX, point.x),
            };
          }

          return currentHighest;
        },
        { y: points[0]!.y, minX: points[0]!.x, maxX: points[0]!.x },
      );

      return {
        x: (highestBounds.minX + highestBounds.maxX) / 2,
        y: highestBounds.y - EDGE_TOOLBAR_VERTICAL_OFFSET,
      } satisfies XYPosition;
    }, [points]);

    const edgeStyle = useMemo<React.CSSProperties>(
      () => ({
        ...style,
        stroke: edgeColor,
        strokeDasharray,
      }),
      [edgeColor, strokeDasharray, style],
    );

    /** Utility to update just the control points array for this edge */
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

    /** Utility to update any part of edge data (style, markers, etc.) */
    const updateEdgeData = useCallback(
      (updater: (current: EditableEdgeData) => EditableEdgeData) => {
        setEdges((currentEdges) =>
          currentEdges.map((edge) => {
            if (edge.id !== id) {
              return edge;
            }

            const currentData: EditableEdgeData = {
              controlPoints: edge.data?.controlPoints ?? [],
              ...edge.data,
            };

            const nextData = updater(currentData);

            return {
              ...edge,
              data: nextData,
            } satisfies Edge<EditableEdgeData>;
          }),
        );
      },
      [id, setEdges],
    );

    const handleSourceMarkerChange = useCallback(
      (value: string) => {
        if (!value) {
          return;
        }

        updateEdgeData((current) => ({
          ...current,
          sourceMarker: value as EdgeMarkerType,
        }));
      },
      [updateEdgeData],
    );

    const handleTargetMarkerChange = useCallback(
      (value: string) => {
        if (!value) {
          return;
        }

        updateEdgeData((current) => ({
          ...current,
          targetMarker: value as EdgeMarkerType,
        }));
      },
      [updateEdgeData],
    );

    const handleStyleTypeChange = useCallback(
      (value: string) => {
        if (!value) {
          return;
        }

        updateEdgeData((current) => ({
          ...current,
          styleType: value as EdgeLineStyle,
        }));
      },
      [updateEdgeData],
    );

    const handleColorChange = useCallback(
      (color: ColorStyle) => {
        updateEdgeData((current) => ({
          ...current,
          color: color.background,
        }));
      },
      [updateEdgeData],
    );

    const edgeToolbarItems = useMemo<ToolbarItem[]>(() => {
      const [SourceArrowIcon, TargetArrowIcon] = isSourceLeft
        ? [ArrowLeft, ArrowRight]
        : [ArrowRight, ArrowLeft];

      return [
        {
          type: "custom",
          id: "source-marker",
          render: () => (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                Source
              </span>
              <ToggleGroup
                type="single"
                value={sourceMarker}
                onValueChange={handleSourceMarkerChange}
                variant="outline"
                size="sm"
                aria-label="Source marker style"
              >
                <ToggleGroupItem value="none" aria-label="Source line">
                  <Minus className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="arrow" aria-label="Source arrow">
                  <SourceArrowIcon className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          ),
        },
        {
          type: "custom",
          id: "target-marker",
          render: () => (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                Target
              </span>
              <ToggleGroup
                type="single"
                value={targetMarker}
                onValueChange={handleTargetMarkerChange}
                variant="outline"
                size="sm"
                aria-label="Target marker style"
              >
                <ToggleGroupItem value="none" aria-label="Target line">
                  <Minus className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="arrow" aria-label="Target arrow">
                  <TargetArrowIcon className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          ),
        },
        { type: "separator", id: "edge-toolbar-separator-1" },
        {
          type: "custom",
          id: "style-type",
          render: () => (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                Style
              </span>
              <ToggleGroup
                type="single"
                value={styleType}
                onValueChange={handleStyleTypeChange}
                variant="outline"
                size="sm"
                aria-label="Edge line style"
              >
                <ToggleGroupItem value="regular">Solid</ToggleGroupItem>
                <ToggleGroupItem value="dashed">Dashed</ToggleGroupItem>
                <ToggleGroupItem value="bolder">Bolder</ToggleGroupItem>
              </ToggleGroup>
            </div>
          ),
        },
        { type: "separator", id: "edge-toolbar-separator-2" },
        {
          type: "custom",
          id: "edge-color",
          render: () => (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                Color
              </span>
              <SimpleColorPicker
                color={{ background: edgeColor, border: "", text: "" }}
                setColor={handleColorChange}
              />
            </div>
          ),
        },
      ];
    }, [
      edgeColor,
      handleColorChange,
      handleSourceMarkerChange,
      handleStyleTypeChange,
      handleTargetMarkerChange,
      sourceMarker,
      styleType,
      targetMarker,
      isSourceLeft,
    ]);

    /**
     * Handles drag interaction on control points.
     * - Uses pointer capture for reliable tracking across the viewport.
     * - Updates control point positions in real-time as user drags.
     */
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
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", handlePointerUp);
          window.removeEventListener("pointercancel", handlePointerUp);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
      },
      [screenToFlowPosition, updateControlPoints],
    );

    /** Double-clicking a control point removes it */
    const handleControlDoubleClick = useCallback(
      (event: ReactMouseEvent<SVGCircleElement>, index: number) => {
        event.stopPropagation();
        event.preventDefault();

        updateControlPoints((current) => current.filter((_, i) => i !== index));
      },
      [updateControlPoints],
    );

    /**
     * Double-clicking the edge path adds a new control point at that location.
     * - Finds closest segment to insert position for natural curve control.
     * - Automatically selects the edge after adding a point.
     */
    const handlePathDoubleClick = useCallback(
      (event: ReactMouseEvent<SVGPathElement>) => {
        if (event.button !== 0) {
          return;
        }

        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        // Find which segment the click is closest to
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
      [
        controlPoints.length,
        id,
        points,
        screenToFlowPosition,
        store,
        updateControlPoints,
      ],
    );

    return (
      <>
        {/* SVG marker definitions for arrow heads */}
        <defs>
          {showSourceArrow && (
            <marker
              id={markerStartId}
              markerWidth="12"
              markerHeight="12"
              refX="5"
              refY="6"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d={sourceMarkerPath} fill={edgeColor} />
            </marker>
          )}
          {showTargetArrow && (
            <marker
              id={markerEndId}
              markerWidth="12"
              markerHeight="12"
              refX="5"
              refY="6"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d={targetMarkerPath} fill={edgeColor} />
            </marker>
          )}
        </defs>
        <g>
          {/* Visible edge path */}
          <path
            className="react-flow__edge-path"
            d={path}
            fill="none"
            stroke={edgeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerStart={markerStartUrl ?? markerStart}
            markerEnd={markerEndUrl ?? markerEnd}
            style={edgeStyle}
          />
          {/* Invisible wider path for easier clicking */}
          <path
            className="react-flow__edge-interaction"
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={interactionWidth}
            onDoubleClick={handlePathDoubleClick}
            style={{ cursor: "pointer" }}
          />
          {/* Render draggable control points when selected */}
          {selected &&
            controlPoints.map((point, index) => (
              <g key={`${id}-control-${index}`}>
                {/* Larger invisible hit area for easier grabbing */}
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
                  style={{ cursor: "grab" }}
                />
                {/* Visible control point circle */}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={CONTROL_POINT_RADIUS}
                  fill="#ffffff"
                  stroke={edgeColor}
                  strokeWidth={2}
                  onPointerDown={(event) =>
                    handleControlPointerDown(event, index)
                  }
                  onDoubleClick={(event) =>
                    handleControlDoubleClick(event, index)
                  }
                  style={{ cursor: "grab" }}
                />
              </g>
            ))}
        </g>
        {/* Floating toolbar for edge styling (only visible when selected) */}
        {selected && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: "absolute",
                transform: `translate(-50%, -100%) translate(${toolbarPosition.x}px, ${toolbarPosition.y}px)`,
                pointerEvents: "all",
                zIndex: 1000,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <TiptapToolbar editor={null} items={edgeToolbarItems} />
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  },
);

EditableEdge.displayName = "EditableEdge";

export default EditableEdge;
