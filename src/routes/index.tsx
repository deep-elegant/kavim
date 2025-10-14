import React from "react";
import ToggleTheme from "@/components/ToggleTheme";
import { useTranslation } from "react-i18next";
import LangToggle from "@/components/LangToggle";
import Footer from "@/components/template/Footer";
import InitialIcons from "@/components/template/InitialIcons";
import { createFileRoute } from "@tanstack/react-router";
import Canvas from "@/core/canvas/Canvas";

function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="h-[calc(100vh-32px-60px)] w-screen">
        <Canvas />
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: HomePage,
});
