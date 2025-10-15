import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { updateAppLanguage } from "./helpers/language_helpers";
import BaseLayout from "./layouts/BaseLayout";
import Canvas from "./core/canvas/Canvas";
import { CanvasDataProvider } from "./core/canvas/CanvasDataContext";
import "./localization/i18n";

export default function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    updateAppLanguage(i18n);
  }, [i18n]);

  return (
    <CanvasDataProvider>
      <BaseLayout>
        <div className="h-full w-full">
          <Canvas />
        </div>
      </BaseLayout>
    </CanvasDataProvider>
  );
}

const root = createRoot(document.getElementById("app")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
