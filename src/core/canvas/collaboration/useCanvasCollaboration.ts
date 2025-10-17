import { useRef, useCallback, useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useWebRTC } from './WebRTCContext';
import type { CollaboratorInteraction } from './useWebRTCManual';

const COLLABORATOR_COLORS = ['#8b5cf6', '#f97316', '#10b981', '#ec4899', '#0ea5e9'];

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

export const useCanvasCollaboration = (
  reactFlowWrapperRef: React.RefObject<HTMLDivElement>,
) => {
  const { updatePresence, remotePresenceByClient, dataChannelState } = useWebRTC();
  const mouseThrottleRef = useRef<number>(0);
  const collaboratorIdentitiesRef = useRef(
    new Map<string, { color: string; label: string }>(),
  );
  const colorIndexRef = useRef<number>(0);
  const lastSelectedNodeRef = useRef<string | null>(null);

  const getIdentity = useCallback((clientId: string) => {
    const existing = collaboratorIdentitiesRef.current.get(clientId);
    if (existing) {
      return existing;
    }

    const color = COLLABORATOR_COLORS[colorIndexRef.current % COLLABORATOR_COLORS.length];
    colorIndexRef.current += 1;
    const label = `Collaborator ${collaboratorIdentitiesRef.current.size + 1}`;
    const identity = { color, label };
    collaboratorIdentitiesRef.current.set(clientId, identity);
    return identity;
  }, []);

  const remoteCollaborators = useMemo<RemoteCollaboratorPresence[]>(() => {
    return Object.entries(remotePresenceByClient)
      .map(([clientId, presence]) => {
        const identity = getIdentity(clientId);
        const hasPosition = Boolean(
          presence?.hasPosition &&
            typeof presence.x === 'number' &&
            typeof presence.y === 'number',
        );
        const position = hasPosition && presence
          ? {
              x: presence.x,
              y: presence.y,
            }
          : null;
        const interaction: CollaboratorInteraction =
          presence?.interaction ?? (presence?.nodeId ? 'selecting' : 'pointer');
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

  const remoteNodeInteractions = useMemo<Map<string, RemoteNodeInteractionState>>(() => {
    const map = new Map<string, RemoteNodeInteractionState>();

    remoteCollaborators.forEach((collaborator) => {
      if (!collaborator.nodeId) {
        return;
      }

      const entry = map.get(collaborator.nodeId) ?? {
        selecting: [],
        typing: [],
      };

      if (collaborator.interaction === 'typing') {
        entry.typing.push(collaborator);
      } else if (collaborator.interaction === 'selecting') {
        entry.selecting.push(collaborator);
      }

      map.set(collaborator.nodeId, entry);
    });

    return map;
  }, [remoteCollaborators]);

  const collaborationPaneMouseMove = useCallback(
    (event: ReactMouseEvent) => {
      if (!reactFlowWrapperRef.current) {
        return;
      }

      const now = Date.now();
      if (now - mouseThrottleRef.current < 16) {
        return;
      }

      const rect = reactFlowWrapperRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      updatePresence({ x, y, hasPosition: true });
      mouseThrottleRef.current = now;
    },
    [reactFlowWrapperRef, updatePresence],
  );

  const broadcastSelection = useCallback(
    (nodeId: string | null) => {
      lastSelectedNodeRef.current = nodeId;
      updatePresence({
        nodeId,
        interaction: nodeId ? 'selecting' : 'pointer',
      });
    },
    [updatePresence],
  );

  const broadcastTyping = useCallback(
    (nodeId: string | null) => {
      if (nodeId) {
        lastSelectedNodeRef.current = nodeId;
      }

      const interaction: CollaboratorInteraction = nodeId
        ? 'typing'
        : lastSelectedNodeRef.current
          ? 'selecting'
          : 'pointer';

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
