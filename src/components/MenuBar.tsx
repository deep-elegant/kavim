import React, { useCallback, useMemo, useState } from "react";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { SaveModal } from "./SaveModal";
import { SettingsModal } from "./SettingsModal";
import { PeerConnectionModal } from "@/core/canvas/collaboration/PeerConnectionModal";
import { useCanvasData } from "@/core/canvas/CanvasDataContext";
import { useWebRTC } from "@/core/canvas/collaboration/WebRTCContext";
import { useTranslation } from "react-i18next";

export default function MenuBar() {
  const { i18n } = useTranslation();
  const { nodes, edges, setCanvasState } = useCanvasData();
  const { connectionState, dataChannelState } = useWebRTC();

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState("untitled.pak");
  const [saveFolder, setSaveFolder] = useState("");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [folderPickerMessage, setFolderPickerMessage] = useState<string>("");

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPeerConnectionOpen, setIsPeerConnectionOpen] = useState(false);
  const [connectionRole, setConnectionRole] = useState<'initiator' | 'responder'>('initiator');
  const [deepseekKey, setDeepseekKey] = useState(
    () => window.settingsStore.get("deepseek")?.apiKey ?? "",
  );
  const [chatgptKey, setChatgptKey] = useState(
    () => window.settingsStore.get("chatgpt")?.apiKey ?? "",
  );
  const [settingsMessage, setSettingsMessage] = useState<string>("");

  React.useEffect(() => {
    if (isSettingsOpen) {
      const storedDeepseekKey =
        window.settingsStore.get("deepseek")?.apiKey ?? "";
      const storedChatgptKey =
        window.settingsStore.get("chatgpt")?.apiKey ?? "";
      setDeepseekKey(storedDeepseekKey);
      setChatgptKey(storedChatgptKey);
      setSettingsMessage("");
    }
  }, [isSettingsOpen]);

  const combinedStatus = useMemo(() => {
    return [saveMessage, settingsMessage].filter(Boolean).join(" · ");
  }, [saveMessage, settingsMessage]);

  const connectionStatus = useMemo(() => {
    if (connectionState === "connected" && dataChannelState === "open") {
      return { label: "Connected", className: "text-green-500" };
    }

    if (
      connectionState === "connecting" ||
      connectionState === "new" ||
      dataChannelState === "connecting"
    ) {
      return { label: "Connecting…", className: "text-yellow-500" };
    }

    if (
      connectionState === "failed" ||
      connectionState === "disconnected" ||
      connectionState === "closed" ||
      dataChannelState === "closed"
    ) {
      return { label: "Failure / Disconnected", className: "text-red-500" };
    }

    return { label: "Idle", className: "text-muted-foreground" };
  }, [connectionState, dataChannelState]);

  const handleLoadClick = useCallback(async () => {
    const filePath = await window.fileSystem.openFile({
      filters: [{ name: "Pak Files", extensions: ["pak"] }],
    });
    if (!filePath) {
      return;
    }

    try {
      const result = await window.projectPak.load(filePath);
      const loadedNodes = Array.isArray(result.canvas?.nodes)
        ? (result.canvas.nodes as typeof nodes)
        : [];
      const loadedEdges = Array.isArray(result.canvas?.edges)
        ? (result.canvas.edges as typeof edges)
        : [];
      setCanvasState(loadedNodes, loadedEdges);
    } catch (error) {
      console.error("Failed to load project", error);
    }
  }, [setCanvasState]);

  const handleFolderBrowse = useCallback(async () => {
    try {
      const directoryHandle = await window.fileSystem.openDirectory();
      if (directoryHandle) {
        setSaveFolder(directoryHandle);
        setFolderPickerMessage(`Selected folder: ${directoryHandle}`);
      } else {
        setFolderPickerMessage("Folder selected.");
      }
    } catch (error) {
      const domError = error as { name?: string };
      if (domError?.name === "AbortError") {
        return;
      }
      setFolderPickerMessage("Unable to access the selected folder.");
    }
  }, [setFolderPickerMessage]);

  const handleSaveConfirmation = async () => {
    const safeFileName = saveFileName.trim() || "untitled.pak";
    const safeFolder = saveFolder.trim();
    const sanitizedNodes = JSON.parse(JSON.stringify(nodes));
    const sanitizedEdges = JSON.parse(JSON.stringify(edges));

    try {
      setSaveMessage(`Saving ${safeFileName}...`);
      const result = await window.projectPak.save({
        fileName: safeFileName,
        directory: safeFolder || undefined,
        canvas: {
          nodes: Array.isArray(sanitizedNodes) ? sanitizedNodes : [],
          edges: Array.isArray(sanitizedEdges) ? sanitizedEdges : [],
        },
      });
      setIsSaveModalOpen(false);
      setSaveMessage(`Saved project to ${result.filePath}`);
    } catch (error) {
      console.error("Failed to save project", error);
      setSaveMessage("Failed to save project.");
    }
  };

  const handleSettingsSave = () => {
    try {
      window.settingsStore.set("deepseek", { apiKey: deepseekKey });
      window.settingsStore.set("chatgpt", { apiKey: chatgptKey });
      setIsSettingsOpen(false);
      setSettingsMessage("API keys saved locally.");
    } catch (error) {
      console.error("Failed to persist API keys", error);
      setSettingsMessage("Unable to save API keys. Please try again.");
    }
  };

  return (
    <div className="border-b border-border bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="flex max-w-5xl items-center justify-between gap-3 px-4">
        <Menubar className="border-none bg-transparent p-0 shadow-none">
          <MenubarMenu>
            <MenubarTrigger>{i18n.t("menuBar.file")}</MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={handleLoadClick}>{i18n.t("menuBar.load")}</MenubarItem>
              <MenubarItem onClick={() => setIsSaveModalOpen(true)}>
                {i18n.t("menuBar.save")}
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>{i18n.t("menuBar.settings")}</MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={() => setIsSettingsOpen(true)}>
                {i18n.t("menuBar.llm")}
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Connect</MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={() => { setIsPeerConnectionOpen(true); setConnectionRole('initiator'); }}>
                Connect as Initiator
              </MenubarItem>
              <MenubarItem onClick={() => { setIsPeerConnectionOpen(true); setConnectionRole('responder'); }}>
                Connect as Responder
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${connectionStatus.className}`}>
            {connectionStatus.label}
          </span>
          {combinedStatus ? (
            <span className="text-sm text-muted-foreground">{combinedStatus}</span>
          ) : null}
        </div>
      </div>

      <SaveModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        saveFileName={saveFileName}
        setSaveFileName={setSaveFileName}
        saveFolder={saveFolder}
        setSaveFolder={setSaveFolder}
        handleFolderBrowse={handleFolderBrowse}
        folderPickerMessage={folderPickerMessage}
        handleSaveConfirmation={handleSaveConfirmation}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        deepseekKey={deepseekKey}
        setDeepseekKey={setDeepseekKey}
        chatgptKey={chatgptKey}
        setChatgptKey={setChatgptKey}
        handleSettingsSave={handleSettingsSave}
      />

      <PeerConnectionModal
        isOpen={isPeerConnectionOpen}
        onClose={() => setIsPeerConnectionOpen(false)}
        role={connectionRole}
      />
    </div>
  );
}
