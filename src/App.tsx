import React, { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { updateAppLanguage } from "./helpers/language_helpers";
import BaseLayout from "./layouts/BaseLayout";
import Canvas from "./core/canvas/Canvas";
import { CanvasDataProvider } from "./core/canvas/CanvasDataContext";
import { WebRTCProvider } from "./core/canvas/collaboration/WebRTCContext";
import { DraftManagerProvider } from "./core/drafts/DraftManagerContext";
import { StatsForNerdsProvider } from "./core/diagnostics/StatsForNerdsContext";
import "./localization/i18n";
import * as Y from "yjs";
import { trackPageView } from "./core/analytics";

/**
 * Main application component with collaborative canvas editing.
 * - Creates a single Yjs document instance shared across all providers for real-time sync.
 * - Provider order matters: WebRTC wraps everything to enable peer communication first.
 */
export default function App() {
  const { i18n } = useTranslation();

  // Memoized to ensure only one Y.Doc instance exists (required for proper collaboration)
  const doc = useMemo(() => new Y.Doc(), []);

  // Sync app language with i18n settings on mount/change
  useEffect(() => {
    updateAppLanguage(i18n);
  }, [i18n]);

  useEffect(() => {
    trackPageView();
  }, []);

  return (
    // WebRTC layer enables real-time collaboration via peer-to-peer connections
    <StatsForNerdsProvider>
      <WebRTCProvider doc={doc}>
        {/* Draft management for auto-save and recovery */}
        <DraftManagerProvider>
          {/* Canvas state tied to the shared Y.Doc for CRDT-based sync */}
          <CanvasDataProvider doc={doc}>
            <Toaster />
            <BaseLayout>
              <div className="h-full w-full">
                <Canvas />
              </div>
            </BaseLayout>
          </CanvasDataProvider>
        </DraftManagerProvider>
      </WebRTCProvider>
    </StatsForNerdsProvider>
  );
}

const root = createRoot(document.getElementById("app")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
