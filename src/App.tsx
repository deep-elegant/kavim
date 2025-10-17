import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { updateAppLanguage } from "./helpers/language_helpers";
import BaseLayout from "./layouts/BaseLayout";
import Canvas from "./core/canvas/Canvas";
import { CanvasDataProvider } from "./core/canvas/CanvasDataContext";
import { WebRTCProvider } from "./core/canvas/collaboration/WebRTCContext";
import "./localization/i18n";

export default function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    updateAppLanguage(i18n);
  }, [i18n]);

  return (
    <WebRTCProvider>
      <CanvasDataProvider>
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
