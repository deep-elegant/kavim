import {
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
  type EdgeChange,
  type XYPosition,
  useReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type NodeChange,
  type Node,
  type OnSelectionChangeParams,
  type SelectionMode,
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
  Youtube,
  Square,
  FrameIcon,
  ShapesIcon,
} from "lucide-react";

import "@xyflow/react/dist/style.css";

import StickyNoteNode, { stickyNoteDrawable } from "./nodes/StickyNoteNode";
import AiNode, { aiNodeDrawable } from "./nodes/AINode";
import ShapeNodeComponent, { shapeDrawable } from "./nodes/ShapeNode";
import TextNodeComponent, { textDrawable } from "./nodes/TextNode";
import ImageNode from "./nodes/ImageNode";
import FrameNode, { frameDrawable } from "./nodes/FrameNode";
import LlmFilePlaceholderNode from "./nodes/LlmFilePlaceholderNode";
import YouTubeNode from "./nodes/YouTubeNode";
import { type DrawableNode } from "./nodes/DrawableNode";
import YouTubeEmbedDialog from "./components/YouTubeEmbedDialog"; // Dialog for embedding YouTube videos
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
import { LinearHistoryProvider } from "./history/LinearHistoryContext";
import LinearHistoryDrawer from "./history/LinearHistoryDrawer";
import useCanvasImageNodes, {
  getFileName,
  isImageFile,
} from "./hooks/useCanvasImageNodes";
import useCanvasYouTubeNodes from "./hooks/useCanvasYouTubeNodes"; // Hook for managing YouTube nodes on the canvas
import type { CanvasNode, ToolId } from "./types";
import { StatsForNerdsOverlay } from "@/components/diagnostics/StatsForNerdsOverlay";
import { usePakAssets } from "@/core/pak/usePakAssets";
import {
  CanvasUndoRedoProvider,
  useCanvasUndoRedo,
  useUndoRedoShortcuts,
} from "./undo";
import clsx from "clsx";
import { Z } from "./nodes/nodesZindex";
import { useCanvasFrame, toLocal } from "./utils/frameReparent";

/**
 * Configuration for a drawing tool, excluding image and YouTube tools.
 */
type DrawingToolConfig = {
  id: Exclude<ToolId, "image" | "youtube">;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const drawingToolConfigs: DrawingToolConfig[] = [
  // Configuration for tools that create nodes by drawing on the canvas
  { id: "sticky-note", label: "Sticky Note", icon: ShapesIcon },
  { id: "frame", label: "Frame", icon: FrameIcon },
  { id: "prompt-node", label: "Prompt Node", icon: WandSparklesIcon },
  { id: "text", label: "Text", icon: Type },
];

/**
 * Type for the ID of a drawing tool.
 */
type DrawingToolId = DrawingToolConfig["id"];

/**
 * Type for the ID of an action button (image or YouTube).
 */
type ActionButtonId = Extract<ToolId, "image" | "youtube">;

/**
 * Configuration for an action button (e.g., for adding images or YouTube videos).
 */
type ActionButtonConfig = {
  id: ActionButtonId;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const actionButtonConfigs: ActionButtonConfig[] = [
  // Configuration for toolbar buttons that trigger specific actions (e.g., adding media)
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "youtube", label: "YouTube Video", icon: Youtube },
];

// ReactFlow node type mapping
const nodeTypes = {
  "sticky-note": StickyNoteNode,
  "shape-node": ShapeNodeComponent,
  "text-node": TextNodeComponent,
  "ai-node": AiNode,
  "llm-file-placeholder": LlmFilePlaceholderNode,
  "image-node": ImageNode,
  "youtube-node": YouTubeNode,
  "frame-node": FrameNode,
};

// Drawable tools implement mouse-based drawing (drag to create)
const drawableNodeTools: Partial<Record<ToolId, DrawableNode>> = {
  "sticky-note": stickyNoteDrawable,
  shape: shapeDrawable,
  text: textDrawable,
  "prompt-node": aiNodeDrawable,
  frame: frameDrawable,
};

// Tools that support click-and-drag creation
const drawingToolIds: ToolId[] = drawingToolConfigs.map((tool) => tool.id);

/**
 * Main canvas component for the infinite collaborative whiteboard.
 * - Handles tool selection and mouse-based drawing
 * - Manages node/edge state with Yjs for real-time collaboration
 * - Broadcasts user interactions (selection, typing) to remote collaborators
 */
const CanvasInner = () => {
  const { nodes, edges, setNodes, setEdges } = useCanvasData();
  const { pickContainingFrame, attachToFrameOnCreate } = useCanvasFrame();
  const { beginAction, commitAction, performAction, undo, redo, isReplaying } =
    useCanvasUndoRedo();
  const [selectedTool, setSelectedTool] = useState<ToolId | null>(null);
  // State to control the visibility of the YouTube embed dialog
  const [isYouTubeDialogOpen, setIsYouTubeDialogOpen] = useState(false);
  // Tracks active drawing operation (node being created by dragging)
  const drawingState = useRef<{
    nodeId: string;
    start: XYPosition;
  } | null>(null);
  const reactFlowWrapperRef = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView, getInternalNode } = useReactFlow();
  const nodeDragTokenRef = useRef<symbol | null>(null);
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
  const isCollaborationActive = dataChannelState === "open";

  const selectionMode = useMemo(() => {
    return "partial" as SelectionMode;
  }, []);

  // Wrap structural changes in `performAction` to make them undoable.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // A structural change is anything that adds or removes a node.
      const hasStructuralChange = changes.some(
        (change) => change.type === "remove" || change.type === "add",
      );

      // If it's structural, wrap it in an undoable action.
      if (hasStructuralChange) {
        performAction(() =>
          setNodes((nds) =>
            applyNodeChanges(changes, nds as Node<CanvasNode>[]),
          ),
        );
        return;
      }

      // Otherwise, apply the changes directly without creating an undo step.
      // This is for performance, as it avoids snapshots for simple moves.
      setNodes((nds) => applyNodeChanges(changes, nds as Node<CanvasNode>[]));
    },
    [performAction, setNodes],
  );

  // Wrap structural edge changes in `performAction` to make them undoable.
  const onEdgesChange = useCallback(
    (changes: EdgeChange<EditableEdgeData>[]) => {
      const hasStructuralChange = changes.some(
        (change) => change.type === "remove" || change.type === "add",
      );

      if (hasStructuralChange) {
        performAction(() =>
          setEdges((current) => applyEdgeChanges(changes, current)),
        );
        return;
      }

      setEdges((current) => applyEdgeChanges(changes, current));
    },
    [performAction, setEdges],
  );

  // For long-running actions like dragging, we use a token-based approach.
  // `beginAction` takes a snapshot, and `commitAction` takes another.
  // The two snapshots are then diffed to create a single undo entry.
  const handleNodeDragStart = useCallback(() => {
    // Don't record history if we are currently replaying it.
    if (isReplaying) {
      return;
    }
    nodeDragTokenRef.current = beginAction("node-drag");

    // Allow dragging children out of frames by temporarily disabling extent
    setNodes((nds) =>
      nds.map((n) => {
        const parentId = (n as any).parentId as string | undefined;
        if (n.selected && parentId) {
          if (n.extent !== undefined) {
            return { ...n, extent: undefined } as Node;
          }
        }
        return n;
      }),
    );
  }, [beginAction, isReplaying, setNodes]);

  // After a drag ends, batch-reparent selected nodes (or the dragged node) to frames
  const handleReparentOnDrop = useCallback(
    (draggedNode: Node) => {
      // normalize frames' zIndex up-front
      const allNodes = nodes;
      const frames = allNodes.filter(
        (n): n is Node & { type: "frame-node" } => n.type === "frame-node",
      );
      if (frames.length === 0) return;

      // Consider all selected, non-frame nodes. If none, fallback to dragged node.
      const selected = allNodes.filter(
        (n) => n.selected && n.type !== "frame-node",
      );
      const candidates = selected.length
        ? selected
        : draggedNode.type === "frame-node"
          ? []
          : [draggedNode];
      if (candidates.length === 0) return;

      const updates = new Map<string, Node>();
      const framesById = new Map(frames.map((frame) => [frame.id, frame]));

      for (const n of candidates) {
        const absPos = getInternalNode(n.id)?.internals.positionAbsolute!;
        const targetFrame = pickContainingFrame(n, frames);

        const currentParentId = (n as any).parentId as string | undefined;
        const currentParent = currentParentId
          ? framesById.get(currentParentId)
          : undefined;
        if (targetFrame && targetFrame.id === currentParentId) {
          // still ensure the child sits above its parent
          if ((n.zIndex ?? 0) <= (targetFrame.zIndex ?? 0)) {
            updates.set(n.id, {
              ...n,
              zIndex: (targetFrame.zIndex ?? Z.FRAME_BASE) + Z.CHILD_OFFSET,
            });
          }
          continue;
        }

        if (targetFrame) {
          const targetFrameAbsPos = getInternalNode(targetFrame.id)?.internals.positionAbsolute!;
          const local = toLocal(absPos, targetFrameAbsPos);
          const frameZ = targetFrame.zIndex ?? Z.FRAME_BASE;
          updates.set(n.id, {
            ...n,
            position: local,
            parentId: targetFrame.id,
            extent: "parent",
            // child ALWAYS above its frame
            zIndex: Math.max(n.zIndex ?? 0, frameZ + Z.CHILD_OFFSET),
          } as Node);
        } else if (currentParent) {
          // leaving a frame → back to content layer
          updates.set(n.id, {
            ...n,
            position: absPos,
            parentId: undefined,
            extent: undefined,
            zIndex: Math.max(n.zIndex ?? 0, Z.CONTENT_BASE),
          } as Node);
        } else {
          // neither before nor after: make sure it has a sane base
          if ((n.zIndex ?? 0) < Z.CONTENT_BASE) {
            updates.set(n.id, { ...n, zIndex: Z.CONTENT_BASE });
          }
        }
      }

      if (updates.size === 0) return;

      setNodes((nds) =>
        nds
          .map((n) => updates.get(n.id) ?? n),
      );
    },
    [nodes, setNodes],
  );

  const handleNodeDragStop = useCallback(
    (_: ReactMouseEvent, node: Node) => {
      const token = nodeDragTokenRef.current;
      // Include reparenting within the same undoable drag step
      handleReparentOnDrop(node as Node);
      nodeDragTokenRef.current = null;
      if (token) {
        commitAction(token);
      }
    },
    [commitAction, handleReparentOnDrop],
  );

  // Creates new edges when user drags connection between nodes
  const onConnect = useCallback(
    (params: Connection) =>
      performAction(
        () =>
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
        "edge-add",
      ),
    [performAction, setEdges],
  );

  // The `onEdgeUpdate` handler has been removed.
  // Edge updates are now handled by the `LinearHistoryProvider` to support undo/redo.
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

  const { addYouTubeNode } = useCanvasYouTubeNodes({
    getCanvasCenterPosition,
    setNodes,
    setSelectedTool,
    performAction,
  });

  /**
   * Handles the open/close state of the YouTube embed dialog.
   * @param open - Whether the dialog should be open.
   */
  const handleYouTubeDialogOpenChange = useCallback(
    (open: boolean) => {
      setIsYouTubeDialogOpen(open);
    },
    [setIsYouTubeDialogOpen],
  );

  /**
   * Handles actions triggered by toolbar buttons (e.g., adding images or YouTube videos).
   * @param actionId - The ID of the action to perform.
   */
  const handleToolbarAction = useCallback(
    (actionId: ActionButtonId) => {
      setSelectedTool(null);
      if (actionId === "image") {
        void handleAddImageFromDialog();
        return;
      }

      if (actionId === "youtube") {
        setIsYouTubeDialogOpen(true);
      }
    },
    [handleAddImageFromDialog, setIsYouTubeDialogOpen, setSelectedTool],
  );

  /**
   * Handles the submission of the YouTube embed dialog, adding a new YouTube node to the canvas.
   * @param videoId - The ID of the YouTube video.
   * @param url - The URL of the YouTube video.
   */
  const handleYouTubeDialogSubmit = useCallback(
    (videoId: string, url: string) => {
      addYouTubeNode(videoId, url);
      setIsYouTubeDialogOpen(false);
    },
    [addYouTubeNode, setIsYouTubeDialogOpen],
  );

  // Drawing tools toggle active state
  const handleDrawingToolSelect = useCallback((id: DrawingToolId) => {
    setSelectedTool((current) => (current === id ? null : id));
  }, []);

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
        return attachToFrameOnCreate(toolImpl.onPaneMouseUp(node), currentNodes);
      }),
    );

    setSelectedTool(null);
  }, [selectedTool, setNodes]);

  const isDrawingToolSelected =
    selectedTool != null && drawingToolIds.includes(selectedTool);

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

  // Enable undo/redo keyboard shortcuts.
  useUndoRedoShortcuts({ undo, redo });

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

  return (
    <div
      className={clsx("rf-wrapper relative", {
        "rf-creating": isDrawingToolSelected,
      })}
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
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          edgeTypes={edgeTypes}
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
          defaultEdgeOptions={{
            type: "editable",
            deletable: true,
            reconnectable: true,
          }}
          deleteKeyCode={["Delete", "Backspace"]}
          connectionRadius={50}
          selectionMode={selectionMode}
          className={isDrawingToolSelected ? "cursor-crosshair" : undefined}
          style={{
            cursor: isDrawingToolSelected ? "cursor-crosshair" : undefined,
          }}
          onSelectionChange={handleSelectionChange}
          nodesDraggable={!selectedTool}
          selectNodesOnDrag={false}
          elevateNodesOnSelect={false}
          minZoom={0.1}
          maxZoom={6.0}
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
                size="icon"
                className="h-14 w-14"
              >
                <ZoomIn style={{ width: 32, height: 32 }} />
              </Button>
              <Button
                onClick={() => zoomOut()}
                aria-label="zoom out"
                title="zoom out"
                variant="ghost"
                size="icon"
                className="h-14 w-14"
              >
                <ZoomOut style={{ width: 32, height: 32 }} />
              </Button>
              <Button
                onClick={() => fitView()}
                aria-label="fit view"
                title="fit view"
                variant="ghost"
                size="icon"
                className="h-14 w-14"
              >
                <Maximize style={{ width: 32, height: 32 }} />
              </Button>
              <div className="border-border mx-1 h-6 border-r" />
              {drawingToolConfigs.map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  aria-label={label}
                  variant={selectedTool === id ? "secondary" : "ghost"}
                  title={label}
                  onClick={() => handleDrawingToolSelect(id)}
                  size="icon"
                  className="h-14 w-14"
                >
                  <Icon style={{ width: 32, height: 32 }} />
                  <span className="sr-only">{label}</span>
                </Button>
              ))}
              <div className="border-border mx-1 h-6 border-r" />
              {actionButtonConfigs.map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  aria-label={label}
                  variant="ghost"
                  title={label}
                  onClick={() => handleToolbarAction(id)}
                  size="icon"
                  className="h-14 w-14"
                >
                  <Icon style={{ width: 32, height: 32 }} />
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

      {/* Dialog for embedding YouTube videos */}
      <YouTubeEmbedDialog
        open={isYouTubeDialogOpen}
        onOpenChange={handleYouTubeDialogOpenChange}
        onSubmit={handleYouTubeDialogSubmit}
      />

      <LinearHistoryDrawer />
    </div>
  );
};

// The CanvasInner component is wrapped in the ReactFlowProvider and supporting providers.
// The `LinearHistoryProvider` provides the context for the linear history feature.
const Flow = () => (
  <ReactFlowProvider>
    <CanvasUndoRedoProvider>
      <LinearHistoryProvider>
        <CanvasInner />
      </LinearHistoryProvider>
    </CanvasUndoRedoProvider>
  </ReactFlowProvider>
);

export default Flow;
