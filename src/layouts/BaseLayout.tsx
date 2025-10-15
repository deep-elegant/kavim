import React from "react";
import DragWindowRegion from "@/components/DragWindowRegion";
import MenuBar from "@/components/MenuBar";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col">
      <DragWindowRegion title="electron-shadcn" />
      <MenuBar />
      <main className="flex-1 overflow-hidden ">{children}</main>
    </div>
  );
}
