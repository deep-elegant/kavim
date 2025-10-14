import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  addEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type XYPosition,
  useReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
} from '@xyflow/react';
import {
  ArrowRight,
  MessageSquareDashed,
  StickyNote,
  Square,
  Type,
  ZoomIn,
  ZoomOut,
  Maximize,
} from 'lucide-react';

import '@xyflow/react/dist/style.css';

import StickyNoteNode, { stickyNoteDrawable, type StickyNoteNodeType } from './nodes/StickyNoteNode';
import AiNode, { aiNodeDrawable, type AiNodeType } from './nodes/AINode';
import ShapeNodeComponent, { shapeDrawable, type ShapeNode } from './nodes/ShapeNode';
import TextNodeComponent, { textDrawable, type TextNode } from './nodes/TextNode';
import { type DrawableNode } from './nodes/DrawableNode';
import { Button } from '@/components/ui/button';
import EditableEdge, {
  createDefaultEditableEdgeData,
  type EditableEdgeData,
} from './edges/EditableEdge';

type ToolId = 'sticky-note' | 'shape' | 'arrow' | 'prompt-node' | 'text';

type CanvasNode = StickyNoteNodeType | ShapeNode | TextNode | AiNodeType;

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
  'text-node': TextNodeComponent,
  'ai-node': AiNode,
};

const drawableNodeTools: Partial<Record<ToolId, DrawableNode>> = {
  'sticky-note': stickyNoteDrawable,
  shape: shapeDrawable,
  text: textDrawable,
  'prompt-node': aiNodeDrawable,
};

const drawingTools: ToolId[] = ['sticky-note', 'shape', 'text', 'prompt-node'];

const CanvasInner = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges] = useState<Edge<EditableEdgeData>[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolId | null>(null);
  const drawingState = useRef<{
    nodeId: string;
    start: XYPosition;
  } | null>(null);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();

  const onEdgesChange = useCallback(
    (changes: EdgeChange<EditableEdgeData>[]) =>
      setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  );

  const onPaneClick = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.data.isTyping) {
          return {
            ...node,
            data: {
              ...node.data,
              isTyping: false,
            },
          };
        }
        return node;
      }),
    );
  }, [setNodes]);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge<EditableEdgeData>(
          {
            ...params,
            type: 'editable',
            data: createDefaultEditableEdgeData(),
            deletable: true,
            reconnectable: true,
          },
          eds,
        ),
      ),
    [],
  );

  const handleEdgeUpdate = useCallback(
    (oldEdge: Edge<EditableEdgeData>, newConnection: Connection) => {
      setEdges((currentEdges) =>
        currentEdges.map((edge) => {
          if (edge.id !== oldEdge.id) {
            return edge;
          }

          return {
            ...edge,
            source: newConnection.source ?? edge.source,
            target: newConnection.target ?? edge.target,
            sourceHandle: newConnection.sourceHandle,
            targetHandle: newConnection.targetHandle,
          };
        }),
      );
    },
    [],
  );

  const edgeTypes = useMemo(() => ({ editable: EditableEdge }), []);

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
        onEdgeUpdate={handleEdgeUpdate}
        edgeTypes={edgeTypes}
        onPaneClick={onPaneClick}
        onMouseDown={handlePaneMouseDown}
        onPaneMouseMove={handlePaneMouseMove}
        onMouseUp={handlePaneMouseUp}
        // Panning with the right mouse button
        panOnDrag={[2]}
        selectionOnDrag={!isDrawingToolSelected}
        nodeTypes={nodeTypes}
        edgesReconnectable
        defaultEdgeOptions={{ type: 'editable', deletable: true, reconnectable: true }}
        deleteKeyCode={['Delete', 'Backspace']}
        className={isDrawingToolSelected ? 'cursor-crosshair' : undefined}
        style={{ cursor: isDrawingToolSelected ? 'crosshair' : undefined }}
      >
        <MiniMap />
        <Controls
          position="bottom-center"
          showZoom={false}
          showInteractive={false}
          showFitView={false}
          orientation="horizontal"
        >
          <div className="flex flex-row items-center gap-2 rounded-lg border border-border bg-background/95 p-2 shadow-lg">
            <Button
              onClick={() => zoomIn()}
              aria-label="zoom in"
              title="zoom in"
              variant="ghost"
            >
              <ZoomIn className="h-5 w-5" />
            </Button>
            <Button
              onClick={() => zoomOut()}
              aria-label="zoom out"
              title="zoom out"
              variant="ghost"
              className=""
            >
              <ZoomOut className="h-5 w-5" />
            </Button>
            <Button
              onClick={() => fitView()}
              aria-label="fit view"
              title="fit view"
              variant="ghost"
            >
              <Maximize className="h-5 w-5" />
            </Button>
            <div className="mx-1 h-6 border-r border-border" />
            {tools.map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                aria-label={label}
                variant="ghost"
                title={label}
                onClick={() => handleToolSelect(id)}
              >
                <Icon className="h-5 w-5" />
                <span className="sr-only">{label}</span>
              </Button>
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
