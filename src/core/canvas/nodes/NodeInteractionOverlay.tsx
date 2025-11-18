import React, {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Handle,
  NodeResizer,
  Position,
  type Node,
  useConnection,
  useInternalNode,
  useStore,
} from "@xyflow/react";
import { type Editor } from "@tiptap/react";

import { cn } from "@/utils/tailwind";
import {
  TiptapToolbar,
  type ToolbarItem,
} from "@/components/ui/minimal-tiptap/TiptapToolbar";
import { useRemoteNodeCollaborators } from "../collaboration/RemoteNodePresenceContext";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCanvasData } from "../CanvasDataContext";
import { copyNodesToClipboard } from "../hooks/useCanvasCopyPaste";
import type { CanvasNode } from "../types";
import { useCanvasUndoRedo } from "../undo";
import { useLinearHistory } from "../history/LinearHistoryContext";
import { useConnectionHoverTarget } from "../hooks/ConnectionHoverContext";
import {
  HANDLE_SIZE,
  HANDLE_OFFSET,
  CONNECTION_HANDLE_OFFSET,
  CONNECTION_RADIUS,
  TOOLBAR_VERTICAL_GAP,
} from "../constants";

/**
 * All 4 sides provide both source and target handles for maximum connection flexibility.
 * This allows users to connect nodes in any direction without being restricted.
 */
const handlePositions: { id: string; position: Position }[] = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
];

/** Position handles just outside the node border for better visual separation */
const getHandleStyle = (position: Position): React.CSSProperties => {
  switch (position) {
    case Position.Top:
      return {
        marginTop: -(HANDLE_OFFSET + CONNECTION_HANDLE_OFFSET),
      };
    case Position.Bottom:
      return {
        marginBottom: -(HANDLE_OFFSET + CONNECTION_HANDLE_OFFSET),
      };
    case Position.Left:
      return {
        marginLeft: -(HANDLE_OFFSET + CONNECTION_HANDLE_OFFSET),
      };
    case Position.Right:
      return {
        marginRight: -(HANDLE_OFFSET + CONNECTION_HANDLE_OFFSET),
      };
    default:
      return {};
  }
};

const sharedHandleStyle: React.CSSProperties = {
  width: HANDLE_SIZE,
  height: HANDLE_SIZE,
  borderRadius: "9999px",
  borderWidth: "2px",
  borderStyle: "solid",
  borderColor: "rgb(59 130 246)",
  backgroundColor: "white",
  boxShadow: "0 0 0 2px rgb(191 219 254 / 0.45)",
};

export type NodeInteractionOverlayProps = PropsWithChildren<{
  nodeId: string;
  isActive: boolean;
  isEditing?: boolean;
  minWidth?: number;
  minHeight?: number;
  className?: string;
  editor?: Editor | null;
  toolbarItems?: ToolbarItem[];
  contextMenuItems?: React.ReactNode;
  allowInteractionsWhileEditing?: boolean;
  onEditingInteractionStart?: () => void;
  onEditingInteractionEnd?: () => void;
}>;

/**
 * Wraps all canvas nodes to provide consistent interaction behavior:
 * - Selection borders (blue for local, colored dashed for remote collaborators)
 * - Resize handles (only when selected and not editing)
 * - Connection handles (shown when selected or during connection attempt)
 * - TipTap toolbar (positioned above node when editing)
 * - Collaborator presence indicators (colored badges showing who's selecting/typing)
 * - Context menu with copy functionality
 *
 * Handles are dynamically shown based on connection state to reduce visual clutter
 * while maintaining discoverability during connection attempts.
 */
const NodeInteractionOverlay = ({
  children,
  nodeId,
  isActive,
  isEditing = false,
  minWidth,
  minHeight,
  className,
  editor,
  toolbarItems,
  contextMenuItems,
  allowInteractionsWhileEditing = false,
  onEditingInteractionStart,
  onEditingInteractionEnd,
}: NodeInteractionOverlayProps) => {
  const { setNodes, getNodes, getEdges } = useCanvasData();
  // The `useLinearHistory` hook provides a function to open the linear history view for a node.
  const { open: openLinearHistory } = useLinearHistory();
  // The `useCanvasUndoRedo` hook provides functions to manage undo/redo state.
  // `beginAction` is called at the start of an operation (like node resizing)
  // to mark a point in the undo history. It returns a unique token.
  // `commitAction` is called at the end of the operation, using the token
  // to finalize the undoable state, grouping all changes between `begin` and `commit`
  // into a single undo/redo step.
  const { beginAction, commitAction, isReplaying } = useCanvasUndoRedo();
  // `resizeTokenRef` stores the unique token returned by `beginAction` when a resize starts.
  // This ensures that `commitAction` can correctly identify and finalize the specific
  // resize operation, making it a single undoable unit.
  const resizeTokenRef = useRef<symbol | null>(null);
  const { selecting: remoteSelecting, typing: remoteTyping } =
    useRemoteNodeCollaborators(nodeId);
  
  // Get the current connection hover target to highlight handles
  const connectionHoverTarget = useConnectionHoverTarget();

  const interactionsDisabledWhileEditing =
    isEditing && !allowInteractionsWhileEditing;

  // Keeps track of temporary drags/resizes triggered while a node is in typing mode.
  const editingInteractionActiveRef = useRef(false);
  // Used to clean up the window-level pointerup listener that restores typing focus.
  const pointerUpListenerRef = useRef<((event: PointerEvent) => void) | null>(
    null,
  );
  const editingInteractionEndRef = useRef(onEditingInteractionEnd);

  useEffect(() => {
    editingInteractionEndRef.current = onEditingInteractionEnd;
  }, [onEditingInteractionEnd]);

  const finishEditingInteraction = useCallback(() => {
    if (!editingInteractionActiveRef.current) {
      return;
    }

    editingInteractionActiveRef.current = false;
    const listener = pointerUpListenerRef.current;
    if (listener) {
      window.removeEventListener("pointerup", listener);
      pointerUpListenerRef.current = null;
    }
    editingInteractionEndRef.current?.();
  }, []);

  const handleEditingInteractionStart = useCallback(() => {
    if (!allowInteractionsWhileEditing || !isEditing) {
      return;
    }

    if (editingInteractionActiveRef.current) {
      return;
    }

    editingInteractionActiveRef.current = true;
    onEditingInteractionStart?.();

    const pointerUpListener = () => {
      finishEditingInteraction();
    };
    pointerUpListenerRef.current = pointerUpListener;
    window.addEventListener("pointerup", pointerUpListener, { once: true });
  }, [
    allowInteractionsWhileEditing,
    finishEditingInteraction,
    isEditing,
    onEditingInteractionStart,
  ]);

  useEffect(() => {
    return () => {
      finishEditingInteraction();
    };
  }, [finishEditingInteraction]);

  useEffect(() => {
    if (!isEditing) {
      finishEditingInteraction();
    }
  }, [finishEditingInteraction, isEditing]);

  // Show resize handles and selection UI when selected. Keep them visible while editing if allowed.
  const shouldShowInteractions = isActive && !interactionsDisabledWhileEditing;

  const connectionRadius = useStore(
    (state) => state.connectionRadius ?? CONNECTION_RADIUS,
  );
  const node = useInternalNode(nodeId);

  // Track connection state to show handles when user is attempting to connect
  const connectionInfo = useConnection((connection) => ({
    inProgress: connection.inProgress,
    fromNodeId: connection.fromNode?.id ?? null,
    toNodeId: connection.toNode?.id ?? null,
    pointerPosition: connection.to ?? null,
  }));
  const { inProgress, fromNodeId, toNodeId, pointerPosition } = connectionInfo;

  // Show handles when pointer is near (even if not hovering) during connection attempts
  const isPointerNearNode = useMemo(() => {
    if (
      !inProgress ||
      !node ||
      !pointerPosition ||
      toNodeId ||
      !node.width ||
      !node.height
    ) {
      return false;
    }

    const { x: pointerX, y: pointerY } = pointerPosition;
    const { x: nodeX, y: nodeY } = node.position;

    return (
      pointerX >= nodeX - connectionRadius &&
      pointerX <= nodeX + node.width + connectionRadius &&
      pointerY >= nodeY - connectionRadius &&
      pointerY <= nodeY + node.height + connectionRadius
    );
  }, [inProgress, node, pointerPosition, toNodeId, connectionRadius]);

  // Show handles: always when selected, or during connection if involved/nearby
  const shouldShowHandles =
    shouldShowInteractions ||
    (inProgress &&
      (fromNodeId === nodeId || toNodeId === nodeId || isPointerNearNode));

  const containerStyle = useMemo<React.CSSProperties>(
    () => ({
      minWidth,
      minHeight,
    }),
    [minHeight, minWidth],
  );

  // Select only this node when context menu opens (deselect others for clarity)
  const handleContextMenuOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        return;
      }

      setNodes((currentNodes) => {
        let hasChanges = false;

        const nextNodes = currentNodes.map((node) => {
          const shouldSelect = node.id === nodeId;
          if (Boolean(node.selected) === shouldSelect) {
            return node;
          }

          hasChanges = true;
          return {
            ...node,
            selected: shouldSelect,
          };
        });

        return hasChanges ? nextNodes : currentNodes;
      });
    },
    [nodeId, setNodes],
  );

  const handleCopySelect = useCallback(() => {
    const latestNodes = getNodes() as Node<CanvasNode>[];
    const selectedNodes = latestNodes.filter((node) => node.selected);
    const latestEdges = getEdges();
    void copyNodesToClipboard(selectedNodes, latestEdges);
  }, [getNodes, getEdges]);

  // This function is called when the user selects the "Show Linear History" context menu item.
  // It opens the linear history view for the current node.
  const handleLinearHistorySelect = useCallback(() => {
    openLinearHistory(nodeId);
  }, [nodeId, openLinearHistory]);

  // Use a token-based approach for the resize action, so that the entire
  // resize operation is a single undoable action.
  const handleResizeStart = useCallback(() => {
    if (isReplaying) {
      return;
    }
    resizeTokenRef.current = beginAction("node-resize");
  }, [beginAction, isReplaying]);

  const handleResizeEnd = useCallback(() => {
    const token = resizeTokenRef.current;
    resizeTokenRef.current = null;
    if (!token) {
      return;
    }

    commitAction(token);
  }, [commitAction]);

  return (
    <ContextMenu onOpenChange={handleContextMenuOpenChange}>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "relative h-full w-full",
            className,
            isEditing && !allowInteractionsWhileEditing && "cursor-text",
            shouldShowInteractions && "cursor-grab active:cursor-grabbing",
          )}
          style={containerStyle}
        >
          {/* Floating toolbar above node (attached via data attribute for portal targeting) */}
          {editor && (
            <div
              data-editor-toolbar
              className="pointer-events-auto absolute top-0 left-1/2 z-10"
              style={{
                transform: `translate(-50%, calc(-100% - ${TOOLBAR_VERTICAL_GAP}px))`,
              }}
            >
              {(isActive || isEditing) && (
                <TiptapToolbar editor={editor} items={toolbarItems} />
              )}
            </div>
          )}

          {children}

          {/* Local selection border (solid blue) */}
          {shouldShowInteractions && (
            <div className="pointer-events-none absolute inset-0 -m-2">
              <div className="absolute inset-0 rounded-xl border-2 border-sky-500/80" />
            </div>
          )}

          {/* Drag surfaces outside the editable content so sticky notes can move while typing */}
          {allowInteractionsWhileEditing && isEditing && isActive && (
            <div aria-hidden className="absolute inset-0">
              <div
                className="pointer-events-auto absolute -top-2 left-4 right-4 h-3 cursor-grab active:cursor-grabbing"
                onPointerDownCapture={handleEditingInteractionStart}
              />
              <div
                className="pointer-events-auto absolute -bottom-2 left-4 right-4 h-3 cursor-grab active:cursor-grabbing"
                onPointerDownCapture={handleEditingInteractionStart}
              />
              <div
                className="pointer-events-auto absolute top-4 bottom-4 -left-2 w-3 cursor-grab active:cursor-grabbing"
                onPointerDownCapture={handleEditingInteractionStart}
              />
              <div
                className="pointer-events-auto absolute top-4 bottom-4 -right-2 w-3 cursor-grab active:cursor-grabbing"
                onPointerDownCapture={handleEditingInteractionStart}
              />
            </div>
          )}

          {/* Remote collaborator selection borders (dashed, colored by user) */}
          {remoteSelecting.length > 0 && (
            <div className="pointer-events-none absolute inset-0 -m-3">
              {remoteSelecting.map((collaborator, index) => (
                <div
                  key={`${collaborator.clientId}-${index}`}
                  className="absolute inset-0 rounded-xl border-2 border-dashed"
                  style={{
                    borderColor: collaborator.color,
                    boxShadow: `0 0 0 1px ${collaborator.color}1A`,
                  }}
                />
              ))}
            </div>
          )}

          {/* "Typing..." badges for remote collaborators actively editing */}
          {remoteTyping.length > 0 && (
            <div className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2">
              {remoteTyping.map((collaborator, index) => (
                <div
                  key={`${collaborator.clientId}-typing-${index}`}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg",
                  )}
                  style={{
                    backgroundColor: collaborator.color,
                    transform: `translateY(calc(-100% - ${index * 8}px))`,
                  }}
                >
                  <span>{collaborator.label}</span>
                  <span className="opacity-80">typing…</span>
                </div>
              ))}
            </div>
          )}

          {/* "Selecting" badges for remote collaborators (only shown if not typing) */}
          {remoteTyping.length === 0 && remoteSelecting.length > 0 && (
            <div className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2">
              {remoteSelecting.map((collaborator, index) => (
                <div
                  key={`${collaborator.clientId}-selecting-${index}`}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg",
                  )}
                  style={{
                    backgroundColor: collaborator.color,
                    transform: `translateY(calc(-100% - ${index * 8}px))`,
                  }}
                >
                  <span>{collaborator.label}</span>
                  <span className="opacity-80">selecting</span>
                </div>
              ))}
            </div>
          )}

          {/* Corner resize handles (visible when node interactions are enabled) */}
          <NodeResizer
            isVisible={shouldShowInteractions}
            minWidth={minWidth}
            minHeight={minHeight}
            lineClassName="!border-sky-500/60"
            handleStyle={sharedHandleStyle}
            onResizeStart={() => {
              handleEditingInteractionStart();
              handleResizeStart();
            }}
            onResizeEnd={() => {
              finishEditingInteraction();
              handleResizeEnd();
            }}
          />

          {/* Connection handles on all 4 sides (both source and target) */}
          {handlePositions.map(({ id, position }) => {
            // Check if this handle is the hover target
            const targetHandleId = `${id}-target`;
            const sourceHandleId = `${id}-source`;
            const isTargetHovered = 
              connectionHoverTarget?.nodeId === nodeId && 
              connectionHoverTarget?.handleId === targetHandleId;
            const isSourceHovered = 
              connectionHoverTarget?.nodeId === nodeId && 
              connectionHoverTarget?.handleId === sourceHandleId;
            
            return (
              <React.Fragment key={id}>
                <Handle
                  type="target"
                  id={targetHandleId}
                  position={position}
                  className={cn(
                    "transition-all",
                    shouldShowHandles
                      ? "pointer-events-auto opacity-100"
                      : "pointer-events-none opacity-0",
                    isTargetHovered && "!opacity-100"
                  )}
                  style={{
                    ...sharedHandleStyle,
                    ...getHandleStyle(position),
                    ...(isTargetHovered && {
                      width: HANDLE_SIZE * 1.4,
                      height: HANDLE_SIZE * 1.4,
                      backgroundColor: "rgb(59 130 246)",
                      borderColor: "rgb(59 130 246)",
                      boxShadow: "0 0 0 4px rgb(191 219 254 / 0.6), 0 0 12px rgb(59 130 246 / 0.5)",
                    }),
                  }}
                />
                <Handle
                  type="source"
                  id={sourceHandleId}
                  position={position}
                  className={cn(
                    "transition-all",
                    shouldShowHandles
                      ? "pointer-events-auto opacity-100"
                      : "pointer-events-none opacity-0",
                    isSourceHovered && "!opacity-100"
                  )}
                  style={{
                    ...sharedHandleStyle,
                    ...getHandleStyle(position),
                    ...(isSourceHovered && {
                      width: HANDLE_SIZE * 1.4,
                      height: HANDLE_SIZE * 1.4,
                      backgroundColor: "rgb(59 130 246)",
                      borderColor: "rgb(59 130 246)",
                      boxShadow: "0 0 0 4px rgb(191 219 254 / 0.6), 0 0 12px rgb(59 130 246 / 0.5)",
                    }),
                  }}
                />
              </React.Fragment>
            );
          })}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onSelect={handleLinearHistorySelect}>
          Show Linear History
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleCopySelect}>Copy</ContextMenuItem>
        {contextMenuItems ? (
          <>
            <ContextMenuSeparator />
            {contextMenuItems}
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default NodeInteractionOverlay;
