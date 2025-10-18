import React, { type PropsWithChildren, useCallback, useMemo } from 'react';
import {
  Handle,
  NodeResizer,
  Position,
  type Node,
  useConnection,
  useInternalNode,
  useStore,
} from '@xyflow/react';
import { type Editor } from '@tiptap/react';

import { cn } from '@/utils/tailwind';
import { TiptapToolbar, type ToolbarItem } from '@/components/ui/minimal-tiptap/TiptapToolbar';
import { useRemoteNodeCollaborators } from '../collaboration/RemoteNodePresenceContext';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useCanvasData } from '../CanvasDataContext';
import { copyNodesToClipboard } from '../hooks/useCanvasCopyPaste';
import type { CanvasNode } from '../types';

const HANDLE_SIZE = 12;
const HANDLE_OFFSET = 10;

const handlePositions: { id: string; position: Position }[] = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
];

const getHandleStyle = (position: Position): React.CSSProperties => {
  switch (position) {
    case Position.Top:
      return { marginTop: -HANDLE_OFFSET };
    case Position.Bottom:
      return { marginBottom: -HANDLE_OFFSET };
    case Position.Left:
      return { marginLeft: -HANDLE_OFFSET };
    case Position.Right:
      return { marginRight: -HANDLE_OFFSET };
    default:
      return {};
  }
};

const sharedHandleStyle: React.CSSProperties = {
  width: HANDLE_SIZE,
  height: HANDLE_SIZE,
  borderRadius: '9999px',
  border: '2px solid rgb(59 130 246)',
  backgroundColor: 'white',
  boxShadow: '0 0 0 2px rgb(191 219 254 / 0.45)',
};

const DEFAULT_CONNECTION_RADIUS = 30;

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
}>;

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
}: NodeInteractionOverlayProps) => {
  const { setNodes, getNodes } = useCanvasData();
  const { selecting: remoteSelecting, typing: remoteTyping } =
    useRemoteNodeCollaborators(nodeId);
  const shouldShowInteractions = isActive && !isEditing;
  const connectionRadius = useStore(
    (state) => state.connectionRadius ?? DEFAULT_CONNECTION_RADIUS,
  );
  const node = useInternalNode(nodeId);
  const connectionInfo = useConnection((connection) => ({
    inProgress: connection.inProgress,
    fromNodeId: connection.fromNode?.id ?? null,
    toNodeId: connection.toNode?.id ?? null,
    pointerPosition: connection.to ?? null,
  }));
  const { inProgress, fromNodeId, toNodeId, pointerPosition } = connectionInfo;
  const isPointerNearNode = useMemo(() => {
    if (!inProgress || !node || !pointerPosition || toNodeId || !node.width || !node.height) {
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
    void copyNodesToClipboard(selectedNodes);
  }, [getNodes]);

  return (
    <ContextMenu onOpenChange={handleContextMenuOpenChange}>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'relative h-full w-full',
            className,
            isEditing && 'cursor-text',
            shouldShowInteractions && 'cursor-grab active:cursor-grabbing',
          )}
          style={containerStyle}
        >
          {editor && (
            <div
              data-editor-toolbar
              className="pointer-events-auto absolute left-1/2 top-0 z-10 -mt-2 -translate-y-full -translate-x-1/2"
            >
              {(isActive || isEditing) && (
                <TiptapToolbar editor={editor} items={toolbarItems} />
              )}
            </div>
          )}

          {children}

          {shouldShowInteractions && (
            <div className="pointer-events-none absolute inset-0 -m-2">
              <div className="absolute inset-0 rounded-xl border-2 border-sky-500/80" />
            </div>
          )}

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

          {remoteTyping.length > 0 && (
            <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2">
              {remoteTyping.map((collaborator, index) => (
                <div
                  key={`${collaborator.clientId}-typing-${index}`}
                  className={cn(
                    'flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium text-white shadow-lg',
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

          {remoteTyping.length === 0 && remoteSelecting.length > 0 && (
            <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2">
              {remoteSelecting.map((collaborator, index) => (
                <div
                  key={`${collaborator.clientId}-selecting-${index}`}
                  className={cn(
                    'flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium text-white shadow-lg',
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

          <NodeResizer
            isVisible={shouldShowInteractions}
            minWidth={minWidth}
            minHeight={minHeight}
            lineClassName="!border-sky-500/60"
            handleStyle={sharedHandleStyle}
          />

          {handlePositions.map(({ id, position }) => (
            <React.Fragment key={id}>
              <Handle
                type="target"
                id={`${id}-target`}
                position={position}
                className={cn(
                  'transition-opacity',
                  shouldShowHandles
                    ? 'pointer-events-auto opacity-100'
                    : 'pointer-events-none opacity-0',
                )}
                style={{ ...sharedHandleStyle, ...getHandleStyle(position) }}
              />
              <Handle
                type="source"
                id={`${id}-source`}
                position={position}
                className={cn(
                  'transition-opacity',
                  shouldShowHandles
                    ? 'pointer-events-auto opacity-100'
                    : 'pointer-events-none opacity-0',
                )}
                style={{ ...sharedHandleStyle, ...getHandleStyle(position) }}
              />
            </React.Fragment>
          ))}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
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
