import { createContext, useContext } from 'react';

import type { RemoteNodeInteractionState } from './useCanvasCollaboration';

const EMPTY_INTERACTION_STATE: RemoteNodeInteractionState = {
  selecting: [],
  typing: [],
};

const RemoteNodePresenceContext = createContext<
  Map<string, RemoteNodeInteractionState>
>(new Map());

export const RemoteNodePresenceProvider = RemoteNodePresenceContext.Provider;

export const useRemoteNodeCollaborators = (nodeId: string) => {
  const map = useContext(RemoteNodePresenceContext);
  return map.get(nodeId) ?? EMPTY_INTERACTION_STATE;
};
