import React, { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { updateAppLanguage } from "./helpers/language_helpers";
import BaseLayout from "./layouts/BaseLayout";
import Canvas from "./core/canvas/Canvas";
import { CanvasDataProvider } from "./core/canvas/CanvasDataContext";
import { WebRTCProvider } from "./core/canvas/collaboration/WebRTCContext";
import "./localization/i18n";
import * as Y from "yjs";

export default function App() {
  const { i18n } = useTranslation();
  const doc = useMemo(() => new Y.Doc(), []);

  useEffect(() => {
    updateAppLanguage(i18n);
  }, [i18n]);

  return (
    <WebRTCProvider doc={doc}>
      <CanvasDataProvider doc={doc}>
        <Toaster />
        <BaseLayout>
          <div className="h-full w-full">
            <Canvas />
          </div>
        </BaseLayout>
      </CanvasDataProvider>
    </WebRTCProvider>
  );
}

const root = createRoot(document.getElementById("app")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
