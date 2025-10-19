import React from "react";
import { useTranslation } from "react-i18next";
import DragWindowRegion from "@/components/DragWindowRegion";
import MenuBar from "@/components/MenuBar";
import { DraftRecoveryManager } from "@/core/drafts/DraftRecoveryManager";
import { AutoSaveManager } from "@/core/drafts/AutoSaveManager";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { i18n } = useTranslation();
  return (
    <div className="flex h-screen flex-col">
      <DragWindowRegion title={i18n.t("appName")} />
      <MenuBar />
      <DraftRecoveryManager />
      <AutoSaveManager />
      <main className="flex-1 overflow-hidden ">{children}</main>
    </div>
  );
}
