import React from "react";
import DragWindowRegion from "@/components/DragWindowRegion";
import MenuBar from "@/components/MenuBar";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DragWindowRegion title="electron-shadcn" />
      <MenuBar />
      <main className="h-screen p-2 pb-20">{children}</main>
    </>
  );
}
