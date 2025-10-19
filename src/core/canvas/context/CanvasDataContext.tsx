import React, { createContext, useContext } from 'react';
import * as Y from 'yjs';
import { useCanvasDataState, type CanvasDataContextValue } from '../state/useCanvasDataState';

const CanvasDataContext = createContext<CanvasDataContextValue | undefined>(undefined);

/**
 * Provides canvas data state (nodes, edges) to the component tree.
 * - Wraps Yjs-backed collaborative state management.
 * - Accepts an optional Yjs doc for shared editing sessions.
 */
export const CanvasDataProvider = ({
  doc,
  children,
}: {
  doc?: Y.Doc;
  children: React.ReactNode;
}) => {
  const value = useCanvasDataState(doc);

  return <CanvasDataContext.Provider value={value}>{children}</CanvasDataContext.Provider>;
};

/**
 * Hook to access canvas data (nodes, edges, setters) within any child component.
 * - Must be used inside a CanvasDataProvider or will throw.
 */
export const useCanvasData = () => {
  const context = useContext(CanvasDataContext);
  if (!context) {
    throw new Error('useCanvasData must be used within a CanvasDataProvider');
  }
  return context;
};
