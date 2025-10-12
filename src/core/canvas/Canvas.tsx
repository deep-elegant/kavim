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
  type Node,
  type XYPosition,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { ArrowRight, MessageSquareDashed, StickyNote, Square, Type } from 'lucide-react';

import '@xyflow/react/dist/style.css';

import StickyNoteNode, { type StickyNoteData } from './nodes/StickyNoteNode';

type ToolId = 'sticky-note' | 'shape' | 'arrow' | 'prompt-node' | 'text';

type StickyNoteNodeType = Node<StickyNoteData>;

const tools: { id: ToolId; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'sticky-note', label: 'Sticky Note', icon: StickyNote },
  { id: 'shape', label: 'Shape', icon: Square },
  { id: 'arrow', label: 'Arrow', icon: ArrowRight },
  { id: 'prompt-node', label: 'Prompt Node', icon: MessageSquareDashed },
  { id: 'text', label: 'Text', icon: Type },
];

const MIN_WIDTH = 100;
const MIN_HEIGHT = 30;

const nodeTypes = {
  'sticky-note': StickyNoteNode,
};

const CanvasInner = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<StickyNoteNodeType>([]);
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
      if (selectedTool !== 'sticky-note' || event.button !== 0) {
        return;
      }

      event.preventDefault();
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const nodeId = crypto.randomUUID();

      const newNode: StickyNoteNodeType = {
        id: nodeId,
        type: 'sticky-note',
        position: flowPosition,
        data: { label: '', isTyping: false },
        width: MIN_WIDTH,
        height: MIN_HEIGHT,
        style: { width: MIN_WIDTH, height: MIN_HEIGHT },
        selected: true,
      };

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
      if (!drawingState.current) {
        return;
      }

      const { nodeId, start } = drawingState.current;
      const current = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const width = Math.max(Math.abs(current.x - start.x), MIN_WIDTH);
      const height = Math.max(Math.abs(current.y - start.y), MIN_HEIGHT);
      const position = {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
      };

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                position,
                width,
                height,
                style: {
                  ...node.style,
                  width,
                  height,
                },
              }
            : node,
        ),
      );
    },
    [screenToFlowPosition, setNodes],
  );

  const handlePaneMouseUp = useCallback(() => {
    if (!drawingState.current) {
      return;
    }

    const { nodeId } = drawingState.current;
    drawingState.current = null;

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        const width = Math.max(Number(node.style?.width ?? node.width ?? 0), MIN_WIDTH);
        const height = Math.max(Number(node.style?.height ?? node.height ?? 0), MIN_HEIGHT);

        return {
          ...node,
          width,
          height,
          style: {
            ...node.style,
            width,
            height,
          },
          data: {
            ...node.data,
            isTyping: true,
          },
        };
      }),
    );

    setSelectedTool(null);
  }, [setNodes]);

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
        panOnDrag={selectedTool !== 'sticky-note'}
        selectionOnDrag={selectedTool !== 'sticky-note'}
        nodeTypes={nodeTypes}
        className={selectedTool === 'sticky-note' ? 'cursor-crosshair' : undefined}
        style={{ cursor: selectedTool === 'sticky-note' ? 'crosshair' : undefined }}
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
