import React, { useMemo, useRef, useState } from "react";
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
  const { nodes, edges } = useCanvasData();

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState("untitled.txt");
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

  const handleLoadClick = () => {
    setLoadMessage("");
    fileInputRef.current?.click();
  };

  const handleFileSelection: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setLoadMessage("No file selected.");
      return;
    }

    setLoadMessage(`Ready to load: ${file.name}`);
    event.target.value = "";
  };

  const handleFolderBrowse = async () => {
    setFolderPickerMessage("");
    const directoryPicker = (window as Window & {
      showDirectoryPicker?: () => Promise<DirectoryHandle>;
    }).showDirectoryPicker;

    if (!directoryPicker) {
      setFolderPickerMessage("Directory picker is not supported in this environment.");
      return;
    }

    try {
      const directoryHandle = await directoryPicker();
      if (directoryHandle?.name) {
        setSaveFolder(directoryHandle.name);
        setFolderPickerMessage(`Selected folder: ${directoryHandle.name}`);
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
  };

  const handleSaveConfirmation = () => {
    console.log("Canvas nodes:", nodes);
    console.log("Canvas edges:", edges);
    setIsSaveModalOpen(false);
    const safeFileName = saveFileName.trim() || "untitled.txt";
    const safeFolder = saveFolder.trim() || "the chosen folder";
    setSaveMessage(`Pretending to save "${safeFileName}" to ${safeFolder}.`);
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
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelection}
      />
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
