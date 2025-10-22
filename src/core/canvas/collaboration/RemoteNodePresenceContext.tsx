import { createContext, useContext } from "react";

import type { RemoteNodeInteractionState } from "./useCanvasCollaboration";

/**
 * Tracks which collaborators are interacting with each node.
 * - Used to show visual indicators (selection rings, typing badges)
 * - Map structure allows O(1) lookup per node
 */

// Fallback for nodes with no collaborators (avoids null checks)
const EMPTY_INTERACTION_STATE: RemoteNodeInteractionState = {
  selecting: [],
  typing: [],
};

const RemoteNodePresenceContext = createContext<
  Map<string, RemoteNodeInteractionState>
>(new Map());

export const RemoteNodePresenceProvider = RemoteNodePresenceContext.Provider;

/**
 * Get all collaborators currently interacting with a specific node.
 * - Returns empty arrays if no collaborators on this node
 */
export const useRemoteNodeCollaborators = (nodeId: string) => {
  const map = useContext(RemoteNodePresenceContext);
  return map.get(nodeId) ?? EMPTY_INTERACTION_STATE;
};
