import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
} from "react";
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
} from "@xyflow/react";
import {
  StickyNote,
  Type,
  ZoomIn,
  ZoomOut,
  Maximize,
  Image as ImageIcon,
  WandSparklesIcon,
  Circle,
} from "lucide-react";

import "@xyflow/react/dist/style.css";

import StickyNoteNode, { stickyNoteDrawable } from "./nodes/StickyNoteNode";
import AiNode, { aiNodeDrawable } from "./nodes/AINode";
import ShapeNodeComponent, { shapeDrawable } from "./nodes/ShapeNode";
import TextNodeComponent, { textDrawable } from "./nodes/TextNode";
import ImageNode from "./nodes/ImageNode";
import { type DrawableNode } from "./nodes/DrawableNode";
import { Button } from "@/components/ui/button";
import EditableEdge, {
  createDefaultEditableEdgeData,
  type EditableEdgeData,
} from "./edges/EditableEdge";
import { useCanvasData } from "./CanvasDataContext";
import { RemoteCursor } from "./collaboration/RemoteCursor";
import { RemoteNodePresenceProvider } from "./collaboration/RemoteNodePresenceContext";
import { useCanvasCollaboration } from "./collaboration/useCanvasCollaboration";
import { useCanvasCopyPaste } from "./hooks/useCanvasCopyPaste";
import useCanvasImageNodes, {
  getFileName,
  isImageFile,
} from "./hooks/useCanvasImageNodes";
import useImageAssetTransfers from "./hooks/useImageAssetTransfers";
import type { CanvasNode, ToolId } from "./types";
import { StatsForNerdsOverlay } from "@/components/diagnostics/StatsForNerdsOverlay";
import { usePakAssets } from "@/core/pak/usePakAssets";
import { useWebRTC } from "./collaboration/WebRTCContext";

// Available drawing tools in the toolbar
const tools: {
  id: ToolId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "sticky-note", label: "Sticky Note", icon: StickyNote },
  { id: "shape", label: "Shape", icon: Circle },
  { id: "prompt-node", label: "Prompt Node", icon: WandSparklesIcon },
  { id: "text", label: "Text", icon: Type },
  { id: "image", label: "Image", icon: ImageIcon },
];

// ReactFlow node type mapping
const nodeTypes = {
  "sticky-note": StickyNoteNode,
  "shape-node": ShapeNodeComponent,
  "text-node": TextNodeComponent,
  "ai-node": AiNode,
  "image-node": ImageNode,
};

// Drawable tools implement mouse-based drawing (drag to create)
const drawableNodeTools: Partial<Record<ToolId, DrawableNode>> = {
  "sticky-note": stickyNoteDrawable,
  shape: shapeDrawable,
  text: textDrawable,
  "prompt-node": aiNodeDrawable,
};

// Tools that support click-and-drag creation
const drawingTools: ToolId[] = ["sticky-note", "shape", "text", "prompt-node"];

/**
 * Main canvas component for the infinite collaborative whiteboard.
 * - Handles tool selection and mouse-based drawing
 * - Manages node/edge state with Yjs for real-time collaboration
 * - Broadcasts user interactions (selection, typing) to remote collaborators
 */
const CanvasInner = () => {
  const { nodes, edges, setNodes, setEdges } = useCanvasData();
  const [selectedTool, setSelectedTool] = useState<ToolId | null>(null);
  // Tracks active drawing operation (node being created by dragging)
  const drawingState = useRef<{
    nodeId: string;
    start: XYPosition;
  } | null>(null);
  const reactFlowWrapperRef = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  // Prevents redundant broadcasts when selection hasn't changed
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
  } = useCanvasCollaboration();
  const {
    completedTransfers,
    failedTransfers,
    requestAsset: requestRemoteAsset,
    releaseAssetRequest: releaseRemoteAssetRequest,
  } = useWebRTC();

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

  // Clear typing state when clicking empty canvas (commits edits)
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

  // Creates new edges when user drags connection between nodes
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge<EditableEdgeData>(
          {
            ...params,
            type: "editable", // This should be a custom edge type
            data: createDefaultEditableEdgeData(),
            deletable: true,
            reconnectable: true,
          },
          eds,
        ),
      ),
    [setEdges],
  );

  // Handles edge reconnection when user drags edge endpoint to different node
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

  // Calculates center of visible canvas (for placing nodes without mouse position)
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

  const pakAssets = usePakAssets();

  const { addImageNode, handleAddImageFromDialog, handleDragOver, handleDrop } =
    useCanvasImageNodes({
      setNodes,
      setSelectedTool,
      screenToFlowPosition,
      getCanvasCenterPosition,
      registerAssetFromFilePath: pakAssets.registerAssetFromFilePath,
      registerAssetFromFile: pakAssets.registerAssetFromFile,
    });

  useImageAssetTransfers({
    nodes,
    setNodes,
    requestAsset: requestRemoteAsset,
    releaseAssetRequest: releaseRemoteAssetRequest,
    completedTransfers,
    failedTransfers,
    pakAssets: {
      hasAsset: pakAssets.hasAsset,
      registerAssetAtPath: pakAssets.registerAssetAtPath,
      isReady: pakAssets.isReady,
    },
  });

  // Image tool opens file picker, other tools toggle active state
  const handleToolSelect = useCallback(
    (id: ToolId) => {
      if (id === "image") {
        setSelectedTool(null);
        void handleAddImageFromDialog();
        return;
      }

      setSelectedTool((current) => (current === id ? null : id));
    },
    [handleAddImageFromDialog],
  );

  // Starts drawing operation when mouse pressed with drawing tool active
  const handlePaneMouseDown = useCallback(
    (event: ReactMouseEvent) => {
      const toolImpl = selectedTool
        ? drawableNodeTools[selectedTool]
        : undefined;
      if (!toolImpl || event.button !== 0) {
        return;
      }

      event.preventDefault();
      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const nodeId = crypto.randomUUID();

      const newNode = toolImpl.onPaneMouseDown(nodeId, flowPosition);

      // Clear any existing selection so the freshly created node becomes the sole active element.
      setNodes((currentNodes) => {
        const deselected = currentNodes.map((node) =>
          node.selected ? { ...node, selected: false } : node,
        );
        return [...deselected, newNode];
      });
      drawingState.current = {
        nodeId,
        start: flowPosition,
      };
    },
    [screenToFlowPosition, selectedTool, setNodes],
  );

  // Updates node dimensions as user drags during creation
  const handlePaneMouseMove = useCallback(
    (event: ReactMouseEvent) => {
      const current = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      // Broadcast cursor position to remote collaborators
      collaborationPaneMouseMove(current);

      if (!drawingState.current || !selectedTool) {
        return;
      }
      const toolImpl = drawableNodeTools[selectedTool];
      if (!toolImpl) {
        return;
      }

      const { nodeId, start } = drawingState.current;

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

  // Tracks cursor for remote collaborators (even when not drawing)
  const handleWrapperMouseMove = useCallback(
    (event: ReactMouseEvent) => {
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      collaborationPaneMouseMove(position);
    },
    [collaborationPaneMouseMove, screenToFlowPosition],
  );

  // Hide cursor from remote collaborators when leaving canvas
  const handleWrapperMouseLeave = useCallback(() => {
    collaborationPaneMouseMove(null);
  }, [collaborationPaneMouseMove]);

  // Finalizes node creation and deselects tool
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

  const isDrawingToolSelected = useMemo(() => {
    return selectedTool != null && drawingTools.includes(selectedTool);
  }, [selectedTool]);

  // Broadcasts which node user has selected to remote collaborators
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

  // Broadcasts typing state so remote users see who's editing what
  useEffect(() => {
    const typingNode = nodes.find(
      (node) => node.data && (node.data as { isTyping?: boolean }).isTyping,
    );
    const typingNodeId = typingNode?.id ?? null;

    if (lastTypingNodeRef.current === typingNodeId) {
      return;
    }

    lastTypingNodeRef.current = typingNodeId;
    broadcastTyping(typingNodeId);

    // Re-broadcast selection when user stops typing
    if (!typingNodeId && currentSelectedNodeRef.current) {
      broadcastSelection(currentSelectedNodeRef.current);
      lastSelectionBroadcastRef.current = currentSelectedNodeRef.current;
    }
  }, [broadcastSelection, broadcastTyping, nodes]);

  const { handlePaste } = useCanvasCopyPaste({
    nodes,
    setNodes,
    setSelectedTool,
    addImageNode,
    getCanvasCenterPosition,
    registerAssetFromBytes: pakAssets.registerAssetFromBytes,
    getFileName,
    isImageFile,
  });

  const panOnDragOptions = useMemo(() => {
    return [2];
  }, []);

  const defaultEdgeOptions = useMemo(() => {
    return {
      type: "editable",
      deletable: true,
      reconnectable: true,
    };
  }, []);

  const deleteKeyCode = useMemo(() => {
    return ["Delete", "Backspace"];
  }, []);

  const connectionRadius = useMemo(() => {
    return 50;
  }, []);

  const cursor = useMemo(() => {
    return isDrawingToolSelected ? "cursor-crosshair" : undefined;
  }, [isDrawingToolSelected]);

  return (
    <div
      className="relative"
      style={{ height: "100%", width: "100%" }}
      ref={reactFlowWrapperRef}
      onPaste={handlePaste}
      onMouseMove={handleWrapperMouseMove}
      onMouseLeave={handleWrapperMouseLeave}
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
          panOnDrag={panOnDragOptions}
          selectionOnDrag={!isDrawingToolSelected}
          nodeTypes={nodeTypes}
          edgesReconnectable
          defaultEdgeOptions={defaultEdgeOptions}
          deleteKeyCode={deleteKeyCode}
          connectionRadius={connectionRadius}
          className={cursor}
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
            <div className="bg-background/95 flex flex-row items-center gap-2 rounded-lg p-2 shadow-lg">
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
              <div className="border-border mx-1 h-6 border-r" />
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
      {dataChannelState === "open" &&
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

      <StatsForNerdsOverlay />
    </div>
  );
};

const Flow = () => (
  <ReactFlowProvider>
    <CanvasInner />
  </ReactFlowProvider>
);

export default Flow;
