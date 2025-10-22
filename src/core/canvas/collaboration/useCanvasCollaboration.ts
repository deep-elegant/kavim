import { useRef, useCallback, useMemo } from "react";
import type { XYPosition } from "@xyflow/react";
import { useWebRTC } from "./WebRTCContext";
import type { CollaboratorInteraction } from "./useWebRTCManual";

/**
 * Hook for canvas-level collaboration features.
 * - Manages cursor positions, node selections, and typing indicators
 * - Assigns stable colors/labels to each collaborator
 * - Throttles mouse updates to reduce network traffic
 */

// Color palette for collaborator cursors (cycles when >5 users)
const COLLABORATOR_COLORS = [
  "#8b5cf6",
  "#f97316",
  "#10b981",
  "#ec4899",
  "#0ea5e9",
];

export type RemoteCollaboratorPresence = {
  clientId: string;
  position: { x: number; y: number } | null;
  nodeId: string | null;
  interaction: CollaboratorInteraction;
  color: string;
  label: string;
};

export type RemoteNodeInteractionState = {
  selecting: RemoteCollaboratorPresence[];
  typing: RemoteCollaboratorPresence[];
};

export const useCanvasCollaboration = () => {
  const { updatePresence, remotePresenceByClient, dataChannelState } =
    useWebRTC();
  const mouseThrottleRef = useRef<number>(0);

  // Stable identity assignment: once a client gets a color/label, it persists
  const collaboratorIdentitiesRef = useRef(
    new Map<string, { color: string; label: string }>(),
  );
  const colorIndexRef = useRef<number>(0);

  // Track last selected node to restore selection state after typing ends
  const lastSelectedNodeRef = useRef<string | null>(null);

  /**
   * Assigns a stable color and label to each collaborator.
   * - Same client always gets same identity (persists across presence updates)
   * - Colors cycle through palette when more users join
   */
  const getIdentity = useCallback((clientId: string) => {
    const existing = collaboratorIdentitiesRef.current.get(clientId);
    if (existing) {
      return existing;
    }

    const color =
      COLLABORATOR_COLORS[colorIndexRef.current % COLLABORATOR_COLORS.length];
    colorIndexRef.current += 1;
    const label = `Collaborator ${collaboratorIdentitiesRef.current.size + 1}`;
    const identity = { color, label };
    collaboratorIdentitiesRef.current.set(clientId, identity);
    return identity;
  }, []);

  /**
   * Transform raw presence data into enriched collaborator objects.
   * - Adds stable color/label identity
   * - Validates position data before creating position object
   * - Sorted by label for consistent UI ordering
   */
  const remoteCollaborators = useMemo<RemoteCollaboratorPresence[]>(() => {
    return Object.entries(remotePresenceByClient)
      .map(([clientId, presence]) => {
        const identity = getIdentity(clientId);
        const hasPosition = Boolean(
          presence?.hasPosition &&
            typeof presence.x === "number" &&
            typeof presence.y === "number",
        );
        const position =
          hasPosition && presence
            ? {
                x: presence.x,
                y: presence.y,
              }
            : null;
        const interaction: CollaboratorInteraction =
          presence?.interaction ?? (presence?.nodeId ? "selecting" : "pointer");
        const nodeId = presence?.nodeId ?? null;

        return {
          clientId,
          position,
          nodeId,
          interaction,
          color: identity.color,
          label: identity.label,
        } satisfies RemoteCollaboratorPresence;
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [getIdentity, remotePresenceByClient]);

  /**
   * Group collaborators by the node they're interacting with.
   * - Enables efficient per-node queries (used in node components)
   * - Splits by interaction type for different UI treatments
   */
  const remoteNodeInteractions = useMemo<
    Map<string, RemoteNodeInteractionState>
  >(() => {
    const map = new Map<string, RemoteNodeInteractionState>();

    remoteCollaborators.forEach((collaborator) => {
      if (!collaborator.nodeId) {
        return;
      }

      const entry = map.get(collaborator.nodeId) ?? {
        selecting: [],
        typing: [],
      };

      if (collaborator.interaction === "typing") {
        entry.typing.push(collaborator);
      } else if (collaborator.interaction === "selecting") {
        entry.selecting.push(collaborator);
      }

      map.set(collaborator.nodeId, entry);
    });

    return map;
  }, [remoteCollaborators]);

  /**
   * Broadcast cursor position on canvas pane mouse move.
   * - Throttled to ~60fps (16ms) to reduce network overhead
   * - Null position clears cursor (mouse left canvas)
   */
  const collaborationPaneMouseMove = useCallback(
    (position: XYPosition | null) => {
      if (!position) {
        updatePresence({ hasPosition: false });
        mouseThrottleRef.current = 0;
        return;
      }

      const now = Date.now();
      if (now - mouseThrottleRef.current < 16) {
        return;
      }

      updatePresence({ x: position.x, y: position.y, hasPosition: true });
      mouseThrottleRef.current = now;
    },
    [updatePresence],
  );

  /**
   * Broadcast when user selects/deselects a node.
   * - Remembers last selection for restoring after typing ends
   */
  const broadcastSelection = useCallback(
    (nodeId: string | null) => {
      lastSelectedNodeRef.current = nodeId;
      updatePresence({
        nodeId,
        interaction: nodeId ? "selecting" : "pointer",
      });
    },
    [updatePresence],
  );

  /**
   * Broadcast when user starts/stops typing in a node.
   * - When typing ends (nodeId=null), reverts to last selected node if any
   * - Prevents selection state from being lost during text editing
   */
  const broadcastTyping = useCallback(
    (nodeId: string | null) => {
      if (nodeId) {
        lastSelectedNodeRef.current = nodeId;
      }

      const interaction: CollaboratorInteraction = nodeId
        ? "typing"
        : lastSelectedNodeRef.current
          ? "selecting"
          : "pointer";

      updatePresence({
        nodeId: nodeId ?? lastSelectedNodeRef.current,
        interaction,
      });
    },
    [updatePresence],
  );

  return {
    collaborationPaneMouseMove,
    remoteCollaborators,
    remoteNodeInteractions,
    dataChannelState,
    broadcastSelection,
    broadcastTyping,
  };
};
