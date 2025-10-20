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
import {
  AI_GATEWAY_METADATA,
  AI_PROVIDER_METADATA,
  type AiGateway,
  type AiProvider,
} from "@/core/llm/aiModels";
import { useDraftManager } from "@/core/drafts/DraftManagerContext";
import { useStatsForNerds } from "@/core/diagnostics/StatsForNerdsContext";

type ProviderKeyState = Record<AiProvider, string>;

/**
 * Form state for a gateway configuration (matches SettingsModal contract).
 * - Temporary state before persisting to electron-store.
 */
type GatewayFormState = {
  apiKey: string;
  useForAllModels: boolean;
  referer: string;
  title: string;
};

type GatewaySettingsState = Record<AiGateway, GatewayFormState>;

/** Loads all provider API keys from persistent storage. */
const createProviderKeyState = (): ProviderKeyState =>
  AI_PROVIDER_METADATA.reduce((accumulator, provider) => {
    accumulator[provider.value] =
      window.settingsStore.getProvider(provider.value)?.apiKey ?? "";
    return accumulator;
  }, {} as ProviderKeyState);

/** Loads all gateway configurations from persistent storage. */
const createGatewaySettingsState = (): GatewaySettingsState =>
  AI_GATEWAY_METADATA.reduce((accumulator, gateway) => {
    const stored = window.settingsStore.getGateway(gateway.value);

    accumulator[gateway.value] = {
      apiKey: stored?.apiKey ?? "",
      useForAllModels: stored?.useForAllModels ?? false,
      referer: stored?.headers?.referer ?? "",
      title: stored?.headers?.title ?? "",
    } satisfies GatewayFormState;

    return accumulator;
  }, {} as GatewaySettingsState);

/**
 * Top menu bar with file operations, settings, and collaboration controls.
 * - Manages save/load for `.pak` project files and draft auto-save.
 * - Provides access to LLM API key settings.
 * - Displays connection status for WebRTC collaboration.
 */
export default function MenuBar() {
  const { i18n } = useTranslation();
  const { nodes, edges, setCanvasState } = useCanvasData();
  const { connectionState, dataChannelState } = useWebRTC();
  const {
    activeDraftId,
    setActiveFilePath,
    deleteDraft,
    saveDraft,
    lastAutoSaveAt,
    saveTarget,
  } = useDraftManager();

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState("untitled.pak");
  const [saveFolder, setSaveFolder] = useState("");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [folderPickerMessage, setFolderPickerMessage] = useState<string>("");

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPeerConnectionOpen, setIsPeerConnectionOpen] = useState(false);
  const [connectionRole, setConnectionRole] = useState<'initiator' | 'responder'>('initiator');
  const [providerKeys, setProviderKeys] = useState<ProviderKeyState>(() => createProviderKeyState());
  const [settingsMessage, setSettingsMessage] = useState<string>("");
  const [gatewaySettings, setGatewaySettings] = useState<GatewaySettingsState>(
    () => createGatewaySettingsState(),
  );
  const { enabled: statsForNerdsEnabled, setEnabled: setStatsForNerdsEnabled } = useStatsForNerds();
  const [statsForNerdsDraftEnabled, setStatsForNerdsDraftEnabled] = useState(
    () => statsForNerdsEnabled,
  );

  // Reload settings from storage when modal opens to reflect any external changes
  React.useEffect(() => {
    if (isSettingsOpen) {
      setProviderKeys(createProviderKeyState());
      setGatewaySettings(createGatewaySettingsState());
      setSettingsMessage("");
      setStatsForNerdsDraftEnabled(statsForNerdsEnabled);
    }
  }, [isSettingsOpen, statsForNerdsEnabled]);

  /**
   * Computes status text for draft/autosave indicator.
   * - Shows "Working from draft" for unsaved drafts.
   * - Shows last auto-save time for both drafts and saved files.
   */
  const draftStatus = useMemo(() => {
    if (!saveTarget) {
      return "";
    }

    const formattedTime = (() => {
      if (!lastAutoSaveAt) {
        return null;
      }
      const parsed = Date.parse(lastAutoSaveAt);
      return Number.isNaN(parsed)
        ? lastAutoSaveAt
        : new Date(parsed).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    })();

    if (saveTarget.type === "draft") {
      if (!formattedTime) {
        return "Working from draft";
      }
      return `Working from draft · Auto-saved ${formattedTime}`;
    }

    return formattedTime ? `Auto-saved ${formattedTime}` : "";
  }, [lastAutoSaveAt, saveTarget]);

  /** Combines draft status, save messages, and settings messages into one line. */
  const combinedStatus = useMemo(() => {
    return [draftStatus, saveMessage, settingsMessage].filter(Boolean).join(" · ");
  }, [draftStatus, saveMessage, settingsMessage]);

  // Listen for Cmd+S / Ctrl+S to open save modal
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
      if (!isSaveShortcut) {
        return;
      }

      // Ignore shortcut if user is typing in an input/textarea/contenteditable
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      event.preventDefault();
      setIsSaveModalOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  /**
   * Computes connection status display for WebRTC collaboration.
   * - Returns label and color class based on connection/channel state.
   * - Returns null if collaboration has not been initiated.
   */
  const connectionStatus = useMemo(() => {
    if (dataChannelState === "not-initiated") {
      return null;
    }

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
      dataChannelState === "closed" ||
      dataChannelState === "closing"
    ) {
      return { label: "Failure / Disconnected", className: "text-red-500" };
    }

    return { label: "Idle", className: "text-muted-foreground" };
  }, [connectionState, dataChannelState]);

  /** Updates a single provider's API key in local state (not persisted until save). */
  const handleProviderKeyChange = useCallback((provider: AiProvider, value: string) => {
    setProviderKeys((previous) => ({
      ...previous,
      [provider]: value,
    }));
  }, []);

  /** Updates a gateway's configuration in local state (not persisted until save). */
  const handleGatewaySettingChange = useCallback(
    (gateway: AiGateway, updates: Partial<GatewayFormState>) => {
      setGatewaySettings((previous) => ({
        ...previous,
        [gateway]: {
          ...previous[gateway],
          ...updates,
        },
      }));
    },
    [],
  );

  /**
   * Opens file picker to load a `.pak` project file.
   * - Deserializes canvas data and replaces current state.
   * - Triggers manual save event to update draft tracking.
   */
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
      setActiveFilePath(filePath);
      window.dispatchEvent(
        new CustomEvent("canvas:manual-save", {
          detail: {
            nodes: JSON.parse(JSON.stringify(loadedNodes)),
            edges: JSON.parse(JSON.stringify(loadedEdges)),
            filePath,
          },
        }),
      );
    } catch (error) {
      console.error("Failed to load project", error);
    }
  }, [setActiveFilePath, setCanvasState]);

  /**
   * Opens native directory picker for save destination.
   * - Uses File System Access API (Chromium-based Electron).
   */
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
      // User cancelled the picker - don't show error
      if (domError?.name === "AbortError") {
        return;
      }
      setFolderPickerMessage("Unable to access the selected folder.");
    }
  }, [setFolderPickerMessage]);

  /**
   * Saves current canvas state to a `.pak` file.
   * - Serializes nodes/edges to msgpack format.
   * - Deletes associated draft after successful save.
   * - Updates file path tracking for future auto-saves.
   */
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
      if (activeDraftId) {
        await deleteDraft(activeDraftId);
      }
      setActiveFilePath(result.filePath);
      window.dispatchEvent(
        new CustomEvent("canvas:manual-save", {
          detail: {
            nodes: Array.isArray(sanitizedNodes) ? sanitizedNodes : [],
            edges: Array.isArray(sanitizedEdges) ? sanitizedEdges : [],
            filePath: result.filePath,
          },
        }),
      );
    } catch (error) {
      console.error("Failed to save project", error);
      setSaveMessage("Failed to save project.");
    }
  };

  /**
   * Saves current canvas state to local draft storage.
   * - Used for auto-save and manual draft saving.
   * - Updates existing draft if one is active, otherwise creates new.
   */
  const handleSaveDraft = useCallback(async () => {
    const sanitizedNodes = JSON.parse(JSON.stringify(nodes));
    const sanitizedEdges = JSON.parse(JSON.stringify(edges));

    const projectName = saveFileName.trim() || "Untitled draft";

    const draft = await saveDraft({
      draftId: activeDraftId ?? undefined,
      projectName,
      canvas: {
        nodes: Array.isArray(sanitizedNodes) ? sanitizedNodes : [],
        edges: Array.isArray(sanitizedEdges) ? sanitizedEdges : [],
      },
    });

    if (draft) {
      const updatedAt = Date.parse(draft.updatedAt);
      const formatted =
        Number.isNaN(updatedAt) ? draft.updatedAt : new Date(updatedAt).toLocaleTimeString();
      setSaveMessage(`Draft saved (${formatted})`);
    } else {
      setSaveMessage("Failed to save draft.");
    }
  }, [activeDraftId, nodes, edges, saveDraft, saveFileName]);

  /**
   * Persists all API keys to electron-store.
   * - Saves provider keys (OpenAI, DeepSeek, etc.).
   * - Saves gateway keys with optional HTTP headers.
   */
  const handleSettingsSave = () => {
    try {
      AI_PROVIDER_METADATA.forEach(({ value: provider }) => {
        window.settingsStore.setProvider(provider, {
          apiKey: providerKeys[provider] ?? "",
        });
      });

      AI_GATEWAY_METADATA.forEach(({ value: gateway }) => {
        const current = gatewaySettings[gateway];
        const referer = current?.referer.trim();
        const title = current?.title.trim();

        window.settingsStore.setGateway(gateway, {
          apiKey: current?.apiKey ?? "",
          useForAllModels: current?.useForAllModels ?? false,
          headers:
            referer || title
              ? {
                  ...(referer ? { referer } : {}),
                  ...(title ? { title } : {}),
                }
              : undefined,
        });
      });
      setStatsForNerdsEnabled(statsForNerdsDraftEnabled);
      setIsSettingsOpen(false);
      setSettingsMessage("Settings saved locally.");
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
              <MenubarItem onClick={handleSaveDraft}>
                {i18n.t("menuBar.saveDraft")}
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
          {connectionStatus ? (
            <span className={`text-sm font-medium ${connectionStatus.className}`}>
              {connectionStatus.label}
            </span>
          ) : null}
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
        providerKeys={providerKeys}
        setProviderKey={handleProviderKeyChange}
        gatewaySettings={gatewaySettings}
        setGatewaySetting={handleGatewaySettingChange}
        handleSettingsSave={handleSettingsSave}
        statsForNerdsEnabled={statsForNerdsDraftEnabled}
        onStatsForNerdsChange={setStatsForNerdsDraftEnabled}
      />

      <PeerConnectionModal
        isOpen={isPeerConnectionOpen}
        onClose={() => setIsPeerConnectionOpen(false)}
        role={connectionRole}
      />
    </div>
  );
}
