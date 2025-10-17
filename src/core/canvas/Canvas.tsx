import React, {
  useCallback,
  useEffect,
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
  addEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type XYPosition,
  useReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type NodeChange,
  type Node,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import {
  StickyNote,
  Type,
  ZoomIn,
  ZoomOut,
  Maximize,
  Image as ImageIcon,
  WandSparklesIcon,
  Circle,
} from 'lucide-react';

import '@xyflow/react/dist/style.css';

import StickyNoteNode, { stickyNoteDrawable } from './nodes/StickyNoteNode';
import AiNode, { aiNodeDrawable } from './nodes/AINode';
import ShapeNodeComponent, { shapeDrawable } from './nodes/ShapeNode';
import TextNodeComponent, { textDrawable } from './nodes/TextNode';
import ImageNode, {
  IMAGE_NODE_MIN_HEIGHT,
  IMAGE_NODE_MIN_WIDTH,
  type ImageNodeType,
} from './nodes/ImageNode';
import { type DrawableNode } from './nodes/DrawableNode';
import { Button } from '@/components/ui/button';
import EditableEdge, {
  createDefaultEditableEdgeData,
  type EditableEdgeData,
} from './edges/EditableEdge';
import { useCanvasData } from './CanvasDataContext';
import { RemoteCursor } from './collaboration/RemoteCursor';
import { RemoteNodePresenceProvider } from './collaboration/RemoteNodePresenceContext';
import { useCanvasCollaboration } from './collaboration/useCanvasCollaboration';
import { useCanvasCopyPaste } from './hooks/useCanvasCopyPaste';
import type { CanvasNode, ToolId } from './types';

const tools: { id: ToolId; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'sticky-note', label: 'Sticky Note', icon: StickyNote },
  { id: 'shape', label: 'Shape', icon: Circle },
  { id: 'prompt-node', label: 'Prompt Node', icon: WandSparklesIcon },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'image', label: 'Image', icon: ImageIcon },
];

const nodeTypes = {
  'sticky-note': StickyNoteNode,
  'shape-node': ShapeNodeComponent,
  'text-node': TextNodeComponent,
  'ai-node': AiNode,
  'image-node': ImageNode,
};

const drawableNodeTools: Partial<Record<ToolId, DrawableNode>> = {
  'sticky-note': stickyNoteDrawable,
  shape: shapeDrawable,
  text: textDrawable,
  'prompt-node': aiNodeDrawable,
};

const drawingTools: ToolId[] = ['sticky-note', 'shape', 'text', 'prompt-node'];

const IMAGE_FILE_FILTERS = [
  {
    name: 'Images',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'],
  },
];

const MAX_IMAGE_DIMENSION = 480;

const loadImageDimensions = (src: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = (event) => {
      reject(event);
    };
    image.src = src;
  });

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read file as data URL.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Unable to read file.'));
    };
    reader.readAsDataURL(file);
  });

const getFileName = (filePath: string) => {
  const segments = filePath.split(/[/\\]/);
  return segments[segments.length - 1] ?? filePath;
};

const isImageFile = (file: File) => {
  if (file.type.startsWith('image/')) {
    return true;
  }

  const lowerCaseName = file.name.toLowerCase();
  return IMAGE_FILE_FILTERS[0].extensions.some((extension) =>
    lowerCaseName.endsWith(`.${extension}`),
  );
};

const CanvasInner = () => {
  const { nodes, edges, setNodes, setEdges } = useCanvasData();
  const [selectedTool, setSelectedTool] = useState<ToolId | null>(null);
  const drawingState = useRef<{
    nodeId: string;
    start: XYPosition;
  } | null>(null);
  const reactFlowWrapperRef = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  const lastSelectionBroadcastRef = useRef<string | null>(null);
  const currentSelectedNodeRef = useRef<string | null>(null);
  const lastTypingNodeRef = useRef<string | null>(null);
  const {
    collaborationPaneMouseMove,
    remoteCollaborators,
    remoteNodeInteractions,
    dataChannelState,
    broadcastSelection,
    broadcastTyping,
  } = useCanvasCollaboration(reactFlowWrapperRef);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds as Node<CanvasNode>[]));
    },
    [setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<EditableEdgeData>[]) =>
      setEdges((current) => applyEdgeChanges(changes, current)),
    [setEdges],
  );

  const onPaneClick = useCallback(() => {
    setNodes((currentNodes) => {
      const hasTypingNode = currentNodes.some((node) => node.data.isTyping);
      if (!hasTypingNode) {
        return currentNodes;
      }

      return currentNodes.map((node) => {
        if (!node.data.isTyping) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            isTyping: false,
          },
        };
      });
    });
  }, [setNodes]);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge<EditableEdgeData>(
          {
            ...params,
            type: 'editable', // This should be a custom edge type
            data: createDefaultEditableEdgeData(),
            deletable: true,
            reconnectable: true,
          },
          eds,
        ),
      ),
    [setEdges],
  );

  const handleEdgeUpdate = useCallback(
    (oldEdge: Edge<EditableEdgeData>, newConnection: Connection) => {
      setEdges((currentEdges) => {
        const index = currentEdges.findIndex((edge) => edge.id === oldEdge.id);
        if (index === -1) {
          return currentEdges;
        }

        const edge = currentEdges[index];
        const nextEdge: Edge<EditableEdgeData> = {
          ...edge,
          source: newConnection.source ?? edge.source,
          target: newConnection.target ?? edge.target,
          sourceHandle: newConnection.sourceHandle,
          targetHandle: newConnection.targetHandle,
        };

        const isSameSource =
          nextEdge.source === edge.source &&
          nextEdge.sourceHandle === edge.sourceHandle;
        const isSameTarget =
          nextEdge.target === edge.target &&
          nextEdge.targetHandle === edge.targetHandle;

        if (isSameSource && isSameTarget) {
          return currentEdges;
        }

        const next = [...currentEdges];
        next[index] = nextEdge;
        return next;
      });
    },
    [setEdges],
  );

  const edgeTypes = useMemo(() => ({ editable: EditableEdge }), []);

  const getCanvasCenterPosition = useCallback((): XYPosition => {
    const bounds = reactFlowWrapperRef.current?.getBoundingClientRect();
    if (!bounds) {
      return screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
    }

    return screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    });
  }, [screenToFlowPosition]);

  const addImageNode = useCallback(
    async (src: string, position: XYPosition, fileName?: string) => {
      let naturalWidth = 0;
      let naturalHeight = 0;
      let width = IMAGE_NODE_MIN_WIDTH;
      let height = IMAGE_NODE_MIN_HEIGHT;

      try {
        const dimensions = await loadImageDimensions(src);
        naturalWidth = dimensions.width;
        naturalHeight = dimensions.height;

        if (naturalWidth > 0 && naturalHeight > 0) {
          const widthScale = MAX_IMAGE_DIMENSION / naturalWidth;
          const heightScale = MAX_IMAGE_DIMENSION / naturalHeight;
          const scale = Math.min(1, widthScale, heightScale);

          width = Math.max(IMAGE_NODE_MIN_WIDTH, Math.round(naturalWidth * scale));
          height = Math.max(IMAGE_NODE_MIN_HEIGHT, Math.round(naturalHeight * scale));

          const aspectRatio = naturalWidth / naturalHeight || 1;

          if (height < IMAGE_NODE_MIN_HEIGHT) {
            height = IMAGE_NODE_MIN_HEIGHT;
            width = Math.max(IMAGE_NODE_MIN_WIDTH, Math.round(height * aspectRatio));
          }

          if (width < IMAGE_NODE_MIN_WIDTH) {
            width = IMAGE_NODE_MIN_WIDTH;
            height = Math.max(IMAGE_NODE_MIN_HEIGHT, Math.round(width / aspectRatio));
          }
        }
      } catch (error) {
        console.error('Failed to determine image dimensions', error);
      }

      const nodeId = crypto.randomUUID();
      const newNode: ImageNodeType = {
        id: nodeId,
        type: 'image-node',
        position,
        data: {
          src,
          alt: fileName ?? 'Image',
          fileName,
          naturalWidth,
          naturalHeight,
        },
        width,
        height,
        style: {
          width,
          height,
        },
        selected: true,
      };

      setNodes((currentNodes) => {
        const deselected = currentNodes.map((node) =>
          node.selected ? { ...node, selected: false } : node,
        );
        return [...deselected, newNode];
      });
    },
    [setNodes],
  );

  const handleAddImageFromDialog = useCallback(async () => {
    try {
      const filePath = await window.fileSystem.openFile({ filters: IMAGE_FILE_FILTERS });
      if (!filePath) {
        return;
      }

      const dataUrl = await window.fileSystem.readFileAsDataUrl(filePath);
      const fileName = getFileName(filePath);
      const centerPosition = getCanvasCenterPosition();

      await addImageNode(dataUrl, centerPosition, fileName);
    } catch (error) {
      console.error('Failed to add image node', error);
    }
  }, [addImageNode, getCanvasCenterPosition]);

  const handleToolSelect = useCallback(
    (id: ToolId) => {
      if (id === 'image') {
        setSelectedTool(null);
        void handleAddImageFromDialog();
        return;
      }

      setSelectedTool((current) => (current === id ? null : id));
    },
    [handleAddImageFromDialog],
  );

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
      collaborationPaneMouseMove(event);

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
    [screenToFlowPosition, selectedTool, setNodes, collaborationPaneMouseMove],
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

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      const nextSelectedId = selectedNodes[0]?.id ?? null;
      currentSelectedNodeRef.current = nextSelectedId;

      if (lastSelectionBroadcastRef.current !== nextSelectedId) {
        lastSelectionBroadcastRef.current = nextSelectedId;
        broadcastSelection(nextSelectedId);
      }
    },
    [broadcastSelection],
  );

  useEffect(() => {
    const typingNode = nodes.find((node) => node.data && (node.data as { isTyping?: boolean }).isTyping);
    const typingNodeId = typingNode?.id ?? null;

    if (lastTypingNodeRef.current === typingNodeId) {
      return;
    }

    lastTypingNodeRef.current = typingNodeId;
    broadcastTyping(typingNodeId);

    if (!typingNodeId && currentSelectedNodeRef.current) {
      broadcastSelection(currentSelectedNodeRef.current);
      lastSelectionBroadcastRef.current = currentSelectedNodeRef.current;
    }
  }, [broadcastSelection, broadcastTyping, nodes]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []).filter(isImageFile);

      if (files.length === 0) {
        return;
      }

      setSelectedTool(null);

      const dropPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      files.forEach((file, index) => {
        readFileAsDataUrl(file)
          .then((dataUrl) => {
            const offset = index * 24;
            void addImageNode(
              dataUrl,
              { x: dropPosition.x + offset, y: dropPosition.y + offset },
              file.name,
            );
          })
          .catch((error) => {
            console.error('Failed to read dropped image', error);
          });
      });
    },
    [addImageNode, screenToFlowPosition, setSelectedTool],
  );

  const { handlePaste } = useCanvasCopyPaste({
    nodes,
    setNodes,
    setSelectedTool,
    addImageNode,
    getCanvasCenterPosition,
    readFileAsDataUrl,
    getFileName,
    isImageFile,
  });

  return (
    <div
      style={{ height: '100%', width: '100%' }}
      ref={reactFlowWrapperRef}
      onPaste={handlePaste}
      onMouseMove={collaborationPaneMouseMove}
    >
      <RemoteNodePresenceProvider value={remoteNodeInteractions}>
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
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          // Panning with the right mouse button
          panOnDrag={[2]}
          selectionOnDrag={!isDrawingToolSelected}
          nodeTypes={nodeTypes}
          edgesReconnectable
          defaultEdgeOptions={{ type: 'editable', deletable: true, reconnectable: true }}
          deleteKeyCode={['Delete', 'Backspace']}
          connectionRadius={50}
          className={isDrawingToolSelected ? 'cursor-crosshair' : undefined}
          style={{ cursor: isDrawingToolSelected ? 'cursor-crosshair' : undefined }}
          onSelectionChange={handleSelectionChange}
        >
          <MiniMap />
          <Controls
            position="bottom-center"
            showZoom={false}
            showInteractive={false}
            showFitView={false}
            orientation="horizontal"
          >
            <div className="flex flex-row items-center gap-2 rounded-lg bg-background/95 p-2 shadow-lg">
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
      </RemoteNodePresenceProvider>

      {/* Remote cursor overlay - positioned relative to the canvas wrapper */}
      {dataChannelState === 'open' &&
        remoteCollaborators.map((collaborator) =>
          collaborator.position ? (
            <RemoteCursor
              key={collaborator.clientId}
              position={collaborator.position}
              color={collaborator.color}
              label={collaborator.label}
            />
          ) : null,
        )}
    </div>
  );
};

const Flow = () => (
  <ReactFlowProvider>
    <CanvasInner />
  </ReactFlowProvider>
);

export default Flow;
