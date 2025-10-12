import React, {
  useCallback,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  ControlButton,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type XYPosition,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { ArrowRight, MessageSquareDashed, StickyNote, Square, Type } from 'lucide-react';

import '@xyflow/react/dist/style.css';

import StickyNoteNode, {
  stickyNoteDrawable,
  type StickyNoteNode as StickyNoteNodeType,
} from './nodes/StickyNoteNode';
import ShapeNodeComponent, { shapeDrawable } from './nodes/ShapeNode';
import { type DrawableNode } from './nodes/DrawableNode';

type ToolId = 'sticky-note' | 'shape' | 'arrow' | 'prompt-node' | 'text';

const tools: { id: ToolId; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'sticky-note', label: 'Sticky Note', icon: StickyNote },
  { id: 'shape', label: 'Shape', icon: Square },
  { id: 'arrow', label: 'Arrow', icon: ArrowRight },
  { id: 'prompt-node', label: 'Prompt Node', icon: MessageSquareDashed },
  { id: 'text', label: 'Text', icon: Type },
];

const nodeTypes = {
  'sticky-note': StickyNoteNode,
  'shape-node': ShapeNodeComponent,
};

const drawableNodeTools: Partial<Record<ToolId, DrawableNode<any>>> = {
  'sticky-note': stickyNoteDrawable,
  shape: shapeDrawable,
};

const drawingTools: ToolId[] = ['sticky-note', 'shape'];

const CanvasInner = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedTool, setSelectedTool] = useState<ToolId | null>(null);
  const drawingState = useRef<{
    nodeId: string;
    start: XYPosition;
  } | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const handleToolSelect = useCallback((id: ToolId) => {
    setSelectedTool((current) => (current === id ? null : id));
  }, []);

  const handlePaneMouseDown = useCallback(
    (event: ReactMouseEvent) => {
      const toolImpl = selectedTool ? drawableNodeTools[selectedTool] : undefined;
      if (!toolImpl || event.button !== 0) {
        return;
      }

      event.preventDefault();
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const nodeId = crypto.randomUUID();

      const newNode = toolImpl.onPaneMouseDown(nodeId, flowPosition);

      setNodes((currentNodes) => [...currentNodes, newNode]);
      drawingState.current = {
        nodeId,
        start: flowPosition,
      };
    },
    [screenToFlowPosition, selectedTool, setNodes],
  );

  const handlePaneMouseMove = useCallback(
    (event: ReactMouseEvent) => {
      if (!drawingState.current || !selectedTool) {
        return;
      }
      const toolImpl = drawableNodeTools[selectedTool];
      if (!toolImpl) {
        return;
      }

      const { nodeId, start } = drawingState.current;
      const current = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          return toolImpl.onPaneMouseMove(node, start, current);
        }),
      );
    },
    [screenToFlowPosition, selectedTool, setNodes],
  );

  const handlePaneMouseUp = useCallback(() => {
    if (!drawingState.current || !selectedTool) {
      return;
    }
    const toolImpl = drawableNodeTools[selectedTool];
    if (!toolImpl) {
      return;
    }

    const { nodeId } = drawingState.current;
    drawingState.current = null;

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }
        return toolImpl.onPaneMouseUp(node);
      }),
    );

    setSelectedTool(null);
  }, [selectedTool, setNodes]);

  const isDrawingToolSelected = selectedTool != null && drawingTools.includes(selectedTool);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onMouseDown={handlePaneMouseDown}
        onPaneMouseMove={handlePaneMouseMove}
        onMouseUp={handlePaneMouseUp}
        // Panning with the right mouse button
        panOnDrag={[2]}
        selectionOnDrag={!isDrawingToolSelected}
        nodeTypes={nodeTypes}
        className={isDrawingToolSelected ? 'cursor-crosshair' : undefined}
        style={{ cursor: isDrawingToolSelected ? 'crosshair' : undefined }}
      >
        <MiniMap />
        <Controls
          position="bottom-center"
          showZoom
          showInteractive
          showFitView
          orientation="horizontal"
        >
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/95 p-2 shadow-lg">
            {tools.map(({ id, label, icon: Icon }) => (
              <ControlButton
                key={id}
                aria-label={label}
                className={`!h-auto !w-auto !rounded-md !bg-transparent !p-2 hover:!bg-accent/60 ${
                  selectedTool === id ? '!bg-accent/60' : ''
                }`}
                title={label}
                onClick={() => handleToolSelect(id)}
              >
                <Icon className="h-5 w-5" />
                <span className="sr-only">{label}</span>
              </ControlButton>
            ))}
          </div>
        </Controls>
        <Background />
      </ReactFlow>
    </div>
  );
};

const Flow = () => (
  <ReactFlowProvider>
    <CanvasInner />
  </ReactFlowProvider>
);

export default Flow;
