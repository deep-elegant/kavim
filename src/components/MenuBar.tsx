import React, { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveModal } from "./SaveModal";
import { SettingsModal } from "./SettingsModal";
import { useCanvasData } from "@/core/canvas/CanvasDataContext";



type DirectoryHandle = {
  name?: string;
};

export default function MenuBar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadMessage, setLoadMessage] = useState<string>("");
  const { nodes, edges, setCanvasState } = useCanvasData();

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState("untitled.pak");
  const [saveFolder, setSaveFolder] = useState("");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [folderPickerMessage, setFolderPickerMessage] = useState<string>("");

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [deepseekKey, setDeepseekKey] = useState(
    () => window.settingsStore.get("deepseek")?.apiKey ?? "",
  );
  const [chatgptKey, setChatgptKey] = useState(
    () => window.settingsStore.get("chatgpt")?.apiKey ?? "",
  );
  const [settingsMessage, setSettingsMessage] = useState<string>("");

  React.useEffect(() => {
    if (isSettingsOpen) {
      const storedDeepseekKey = window.settingsStore.get("deepseek")?.apiKey ?? "";
      const storedChatgptKey = window.settingsStore.get("chatgpt")?.apiKey ?? "";
      setDeepseekKey(storedDeepseekKey);
      setChatgptKey(storedChatgptKey);
      setSettingsMessage("");
    }
  }, [isSettingsOpen]);

  const combinedStatus = useMemo(() => {
    return [loadMessage, saveMessage, settingsMessage].filter(Boolean).join(" · ");
  }, [loadMessage, saveMessage, settingsMessage]);

  const handleLoadClick = useCallback(async () => {
    setLoadMessage("");
    const filePath = await window.dialog.openFile();
    if (!filePath) {
      setLoadMessage("No file selected.");
      return;
    }

    try {
      setLoadMessage(`Loading ${filePath}...`);
      const result = await window.projectPak.load(filePath);
      const loadedNodes = Array.isArray(result.canvas?.nodes)
        ? (result.canvas.nodes as typeof nodes)
        : [];
      const loadedEdges = Array.isArray(result.canvas?.edges)
        ? (result.canvas.edges as typeof edges)
        : [];
      setCanvasState(loadedNodes, loadedEdges);

      const manifestName =
        (result.manifest as { name?: string } | undefined)?.name || filePath;
      setLoadMessage(`Loaded ${manifestName}`);
    } catch (error) {
      console.error("Failed to load project", error);
      setLoadMessage("Failed to load project.");
    }
  }, [setCanvasState]);

  const handleFolderBrowse = useCallback(async () => {
    try {
      const directoryHandle = await window.dialog.openDirectory();
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
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleLoadClick}>
            Load
          </Button>
          <Button variant="outline" onClick={() => setIsSaveModalOpen(true)}>
            Save
          </Button>
          <Button variant="outline" onClick={() => setIsSettingsOpen(true)}>
            Settings
          </Button>
        </div>
        {combinedStatus ? (
          <span className="text-sm text-muted-foreground">{combinedStatus}</span>
        ) : null}
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
    </div>
  );
}
