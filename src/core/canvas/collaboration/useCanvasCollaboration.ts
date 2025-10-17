import { useRef, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useWebRTC } from './WebRTCContext';

export const useCanvasCollaboration = (
  reactFlowWrapperRef: React.RefObject<HTMLDivElement>,
) => {
  const { sendMousePosition, remoteMouse, dataChannelState } = useWebRTC();
  const mouseThrottleRef = useRef<number>(0);

  const collaborationPaneMouseMove = useCallback(
    (event: ReactMouseEvent) => {
      // Send mouse position to peer (throttled)
      if (dataChannelState === 'open' && reactFlowWrapperRef.current) {
        const now = Date.now();
        if (now - mouseThrottleRef.current >= 16) {
          // ~60fps
          const rect = reactFlowWrapperRef.current.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          console.log('🖱️ Sending mouse position:', { x, y });
          sendMousePosition(x, y);
          mouseThrottleRef.current = now;
        }
      }
    },
    [dataChannelState, reactFlowWrapperRef, sendMousePosition],
  );

  return { collaborationPaneMouseMove, remoteMouse, dataChannelState };
};
