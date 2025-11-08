import { useCallback, useRef, useState } from "react";
import type { Connection, Node, OnConnectStartParams, OnConnect } from "@xyflow/react";
import type { CanvasNode } from "../types";
import { NODE_BOUNDS_SNAP_RADIUS } from "../constants";

/**
 * Information about the current hover target during connection drag
 */
export type ConnectionHoverTarget = {
  nodeId: string;
  handleId: string;
} | null;

/**
 * Enhanced connection snapping logic that makes it easier to connect edges.
 * 
 * This hook provides:
 * 1. Increased snap radius around handles (via connectionRadius prop)
 * 2. Auto-connection when releasing inside node bounds
 * 3. Smart handle selection (picks closest available handle)
 * 4. Visual feedback showing which handle will be connected
 */
export const useEnhancedConnectionSnap = (
  nodes: Node<CanvasNode>[],
  onConnectCallback: (connection: Connection) => void
) => {
  const connectionStartRef = useRef<OnConnectStartParams | null>(null);
  const isConnectingRef = useRef(false);
  const [hoverTarget, setHoverTarget] = useState<ConnectionHoverTarget>(null);

  /**
   * Called when user starts dragging from a handle
   */
  const handleConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      connectionStartRef.current = params;
      isConnectingRef.current = false;
      setHoverTarget(null);
    },
    []
  );

  /**
   * Intercept ReactFlow's onConnect to track if it found a valid connection
   */
  const handleConnect = useCallback<OnConnect>(
    (connection) => {
      
      // Mark that connection was handled
      isConnectingRef.current = true;
      
      // Always create the connection
      onConnectCallback(connection);
    },
    [onConnectCallback]
  );

  /**
   * Called when user releases the connection drag.
   * This is where we implement the auto-snap logic.
   * Only runs if ReactFlow didn't already handle the connection.
   */
  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      // Clear hover state
      setHoverTarget(null);
      
      // Wait a tick to see if ReactFlow's onConnect was called
      setTimeout(() => {
        if (isConnectingRef.current) {
          isConnectingRef.current = false;
          connectionStartRef.current = null;
          return;
        }
        
        const startParams = connectionStartRef.current;
        connectionStartRef.current = null;

        if (!startParams || !startParams.nodeId || !startParams.handleId) {
          return;
        }

        // Get the mouse position in screen coordinates
        const clientX = 'clientX' in event ? event.clientX : event.changedTouches[0].clientX;
        const clientY = 'clientY' in event ? event.clientY : event.changedTouches[0].clientY;
        

        // Find if the mouse is over any node
        const targetNode = findNodeAtPosition(nodes, { x: clientX, y: clientY });
        

        if (!targetNode) {
          return;
        }

        // Don't connect to the same node
        if (targetNode.id === startParams.nodeId) {
          return;
        }

        // Find the best handle on the target node
        const targetHandle = findClosestHandle(targetNode, { x: clientX, y: clientY });
        

        if (!targetHandle) {
          return;
        }

        // Determine if we're connecting from a source or target handle
        const isSourceHandle = startParams.handleType === 'source';

        // Create the connection
        const connection: Connection = isSourceHandle
          ? {
              source: startParams.nodeId,
              sourceHandle: startParams.handleId,
              target: targetNode.id,
              targetHandle: targetHandle,
            }
          : {
              source: targetNode.id,
              sourceHandle: targetHandle,
              target: startParams.nodeId,
              targetHandle: startParams.handleId,
            };


        // Call the original onConnect callback
        onConnectCallback(connection);
      }, 0);
    },
    [nodes, onConnectCallback]
  );

  /**
   * Track mouse movement during connection to update hover state
   */
  const handleConnectionMove = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const startParams = connectionStartRef.current;
      
      // Only track if we're in a connection drag
      if (!startParams || !startParams.nodeId || !startParams.handleId) {
        return;
      }

      // Get the mouse position in screen coordinates
      const clientX = 'clientX' in event ? event.clientX : event.changedTouches?.[0]?.clientX;
      const clientY = 'clientY' in event ? event.clientY : event.changedTouches?.[0]?.clientY;
      
      if (!clientX || !clientY) {
        return;
      }

      // Find if the mouse is over any node
      const targetNode = findNodeAtPosition(nodes, { x: clientX, y: clientY });

      // Clear hover if no node found or hovering over the source node
      if (!targetNode || targetNode.id === startParams.nodeId) {
        setHoverTarget(null);
        return;
      }

      // Find the best handle on the target node
      const targetHandle = findClosestHandle(targetNode, { x: clientX, y: clientY });

      if (!targetHandle) {
        setHoverTarget(null);
        return;
      }

      // Update hover target
      setHoverTarget({
        nodeId: targetNode.id,
        handleId: targetHandle,
      });
    },
    [nodes]
  );

  return {
    onConnectStart: handleConnectStart,
    onConnect: handleConnect,
    onConnectEnd: handleConnectEnd,
    onConnectionMove: handleConnectionMove,
    hoverTarget,
  };
};

/**
 * Finds a node at the given screen position, checking if the position
 * is within the node's bounding box + snap radius.
 */
function findNodeAtPosition(
  nodes: Node<CanvasNode>[],
  screenPos: { x: number; y: number }
): Node<CanvasNode> | null {
  
  // We need to check against the actual DOM elements to get screen coordinates
  for (const node of nodes) {
    if (!node.width || !node.height) {
      continue;
    }

    // Get the node's DOM element
    const nodeElement = document.querySelector(`[data-id="${node.id}"]`);
    if (!nodeElement) {
      continue;
    }

    const rect = nodeElement.getBoundingClientRect();
    
    // Check if mouse is within node bounds + snap radius
    if (
      screenPos.x >= rect.left - NODE_BOUNDS_SNAP_RADIUS &&
      screenPos.x <= rect.right + NODE_BOUNDS_SNAP_RADIUS &&
      screenPos.y >= rect.top - NODE_BOUNDS_SNAP_RADIUS &&
      screenPos.y <= rect.bottom + NODE_BOUNDS_SNAP_RADIUS
    ) {
      return node;
    }
  }

  return null;
}

/**
 * Determines which handle on a node is closest to the mouse position (in screen coordinates).
 * 
 * Handle IDs follow the pattern: "top-target", "right-target", etc.
 * We pick the handle on the side closest to where the mouse is.
 */
function findClosestHandle(
  node: Node,
  screenPos: { x: number; y: number }
): string | null {
  const nodeElement = document.querySelector(`[data-id="${node.id}"]`);
  if (!nodeElement) {
    return null;
  }

  const rect = nodeElement.getBoundingClientRect();
  const nodeCenter = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };

  // Calculate which side of the node is closest to mouse
  const dx = screenPos.x - nodeCenter.x;
  const dy = screenPos.y - nodeCenter.y;

  // Determine handle based on which direction has greater offset
  if (Math.abs(dx) > Math.abs(dy)) {
    // Mouse is more to the left or right
    return dx > 0 ? "right-target" : "left-target";
  } else {
    // Mouse is more to the top or bottom
    return dy > 0 ? "bottom-target" : "top-target";
  }
}
