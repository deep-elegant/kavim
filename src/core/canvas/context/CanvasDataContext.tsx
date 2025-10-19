import React, { createContext, useContext } from 'react';
import * as Y from 'yjs';
import { useCanvasDataState, type CanvasDataContextValue } from '../state/useCanvasDataState';

const CanvasDataContext = createContext<CanvasDataContextValue | undefined>(undefined);

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

export const useCanvasData = () => {
  const context = useContext(CanvasDataContext);
  if (!context) {
    throw new Error('useCanvasData must be used within a CanvasDataProvider');
  }
  return context;
};
