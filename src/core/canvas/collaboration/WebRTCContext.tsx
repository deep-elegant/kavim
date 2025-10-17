import React, { createContext, useContext, ReactNode } from 'react';
import * as Y from 'yjs';
import { useWebRTCManual } from './useWebRTCManual';

type WebRTCContextType = ReturnType<typeof useWebRTCManual>;

const WebRTCContext = createContext<WebRTCContextType | null>(null);

export function WebRTCProvider({ doc, children }: { doc: Y.Doc; children: ReactNode }) {
  const webrtc = useWebRTCManual(doc);

  return (
    <WebRTCContext.Provider value={webrtc}>
      {children}
    </WebRTCContext.Provider>
  );
}

export function useWebRTC() {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTC must be used within a WebRTCProvider');
  }
  return context;
}
