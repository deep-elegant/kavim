import React, { createContext, useContext, type ReactNode } from "react";
import type { ConnectionHoverTarget } from "./useEnhancedConnectionSnap";

/**
 * Context to share the current connection hover target with all nodes.
 * This allows nodes to highlight their handles when they're about to be connected.
 */
const ConnectionHoverContext = createContext<ConnectionHoverTarget>(null);

export const ConnectionHoverProvider = ({
  children,
  value,
}: {
  children: ReactNode;
  value: ConnectionHoverTarget;
}) => {
  return (
    <ConnectionHoverContext.Provider value={value}>
      {children}
    </ConnectionHoverContext.Provider>
  );
};

/**
 * Hook to access the current connection hover target.
 * Returns null if no connection is in progress or cursor is not over a target node.
 */
export const useConnectionHoverTarget = () => {
  return useContext(ConnectionHoverContext);
};
