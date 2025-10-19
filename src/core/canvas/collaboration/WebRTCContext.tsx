import React, { createContext, useContext, ReactNode } from 'react';
import * as Y from 'yjs';
import { useWebRTCManual } from './useWebRTCManual';

/**
 * Context for WebRTC peer-to-peer collaboration state.
 * - Wraps useWebRTCManual hook to provide connection management throughout the app
 * - Shares Y.Doc instance for CRDT-based synchronization
 */

type WebRTCContextType = ReturnType<typeof useWebRTCManual>;

const WebRTCContext = createContext<WebRTCContextType | null>(null);

/**
 * Provides WebRTC collaboration capabilities to the component tree.
 * - Must receive the same Y.Doc instance used in CanvasDataProvider for proper sync
 */
export function WebRTCProvider({ doc, children }: { doc: Y.Doc; children: ReactNode }) {
  const webrtc = useWebRTCManual(doc);

  return (
    <WebRTCContext.Provider value={webrtc}>
      {children}
    </WebRTCContext.Provider>
  );
}

/**
 * Hook to access WebRTC collaboration features.
 * - Throws if used outside WebRTCProvider (prevents undefined behavior)
 */
export function useWebRTC() {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTC must be used within a WebRTCProvider');
  }
  return context;
}
