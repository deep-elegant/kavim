import React, { useCallback, useMemo, useState } from "react";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SaveModal } from "./SaveModal";
import { SettingsModal } from "./SettingsModal";
import { PrepromptModal } from "./PrepromptModal";
import { AboutModal } from "./AboutModal";
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
import { LLM_PROVIDER_KEYS_UPDATED_EVENT } from "@/core/llm/llmAvailability";
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

const splitFilePath = (filePath: string) => {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index === -1) {
    return { directory: undefined, fileName: filePath };
  }
  const directory = filePath.slice(0, index);
  const fileName = filePath.slice(index + 1);
  return { directory: directory || undefined, fileName };
};

/**
 * Top menu bar with file operations, settings, and collaboration controls.
 * - Manages save/load for `.pak` project files and draft auto-save.
 * - Provides access to LLM API key settings.
 * - Displays connection status for WebRTC collaboration.
 */
export default function MenuBar() {
  const { i18n } = useTranslation();
  const { nodes, edges, setCanvasState } = useCanvasData();
  const {
    connectionState,
    dataChannelState,
    requestSync,
    broadcastNewBoard,
    incomingNewBoard,
    clearIncomingNewBoard,
  } = useWebRTC();
  const {
    drafts,
    activeDraftId,
    setActiveDraftId,
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
  const [isNewBoardDialogOpen, setIsNewBoardDialogOpen] = useState(false);
  const [isNewBoardWorking, setIsNewBoardWorking] = useState(false);
  const [newBoardError, setNewBoardError] = useState<string | null>(null);
  const [isRemoteNewBoardModalOpen, setIsRemoteNewBoardModalOpen] =
    useState(false);
  const [isRemoteNewBoardWorking, setIsRemoteNewBoardWorking] =
    useState(false);
  const [remoteNewBoardError, setRemoteNewBoardError] = useState<string | null>(
    null,
  );
  const [remoteNewBoardSessionId, setRemoteNewBoardSessionId] = useState<
    string | null
  >(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPeerConnectionOpen, setIsPeerConnectionOpen] = useState(false);
  const [connectionRole, setConnectionRole] = useState<
    "initiator" | "responder"
  >("initiator");
  const [providerKeys, setProviderKeys] = useState<ProviderKeyState>(() =>
    createProviderKeyState(),
  );
  const [settingsMessage, setSettingsMessage] = useState<string>("");
  const [gatewaySettings, setGatewaySettings] = useState<GatewaySettingsState>(
    () => createGatewaySettingsState(),
  );
  const { enabled: statsForNerdsEnabled, setEnabled: setStatsForNerdsEnabled } =
    useStatsForNerds();
  const [isPrepromptModalOpen, setIsPrepromptModalOpen] = useState(false);
  const [prepromptText, setPrepromptText] = useState("");
  const [prepromptStatus, setPrepromptStatus] = useState<
    { message: string; tone: "default" | "success" | "error" } | null
  >(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Reload settings from storage when modal opens to reflect any external changes
  React.useEffect(() => {
    if (isSettingsOpen) {
      setProviderKeys(createProviderKeyState());
      setGatewaySettings(createGatewaySettingsState());
      setSettingsMessage("");
    }
  }, [isSettingsOpen, statsForNerdsEnabled]);

  React.useEffect(() => {
    if (isPrepromptModalOpen) {
      setPrepromptText(window.settingsStore.getPreprompt() ?? "");
      setPrepromptStatus(null);
    }
  }, [isPrepromptModalOpen]);

  const getCurrentSnapshot = useCallback(() => {
    const clonedNodes = JSON.parse(JSON.stringify(nodes));
    const clonedEdges = JSON.parse(JSON.stringify(edges));
    return {
      nodes: Array.isArray(clonedNodes) ? clonedNodes : [],
      edges: Array.isArray(clonedEdges) ? clonedEdges : [],
    };
  }, [nodes, edges]);

  const performPreResetSave = useCallback(
    async (
      snapshot: { nodes: unknown[]; edges: unknown[] },
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const hasContent =
        Array.isArray(snapshot.nodes) && snapshot.nodes.length > 0
          ? true
          : Array.isArray(snapshot.edges) && snapshot.edges.length > 0;

      try {
        if (saveTarget?.type === "file") {
          const { fileName, directory } = splitFilePath(saveTarget.filePath);
          await window.projectPak.save({
            fileName,
            directory,
            canvas: {
              nodes: snapshot.nodes,
              edges: snapshot.edges,
            },
          });
          window.dispatchEvent(
            new CustomEvent("canvas:manual-save", {
              detail: {
                nodes: snapshot.nodes,
                edges: snapshot.edges,
                filePath: saveTarget.filePath,
              },
            }),
          );
          return { ok: true };
        }

        if (saveTarget?.type === "draft" || hasContent) {
          const draftId =
            saveTarget?.type === "draft"
              ? saveTarget.draftId
              : activeDraftId ?? undefined;
          const activeDraftRecord =
            draftId && drafts.find((draft) => draft.id === draftId);
          const projectName =
            activeDraftRecord?.projectName ??
            (saveFileName.trim() ? saveFileName.trim() : null);

          const draft = await saveDraft({
            draftId,
            projectName,
            filePath: activeDraftRecord?.filePath ?? undefined,
            canvas: {
              nodes: snapshot.nodes,
              edges: snapshot.edges,
            },
          });

          if (!draft) {
            throw new Error("Draft save completed without returning data");
          }

          window.dispatchEvent(
            new CustomEvent("canvas:manual-save", {
              detail: {
                nodes: snapshot.nodes,
                edges: snapshot.edges,
              },
            }),
          );

          if (draftId) {
            setActiveDraftId(null);
          }
        }

        return { ok: true };
      } catch (error) {
        console.error("Failed to save current board before reset", error);
        return {
          ok: false,
          error:
            "Saving current board failed. Please try again before starting a new board.",
        };
      }
    },
    [
      activeDraftId,
      drafts,
      saveDraft,
      saveFileName,
      saveTarget,
      setActiveDraftId,
    ],
  );

  const initializeBlankBoard = useCallback(
    async (
      options?: { message?: string },
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        const newDraft = await saveDraft({
          projectName: null,
          canvas: { nodes: [], edges: [] },
        });

        if (!newDraft) {
          throw new Error("Draft creation returned null");
        }

        setCanvasState([], []);
        setActiveFilePath(null);
        window.dispatchEvent(
          new CustomEvent("canvas:new-session", {
            detail: {
              nodes: [],
              edges: [],
            },
          }),
        );
        setIsNewBoardDialogOpen(false);
        setSaveMessage(options?.message ?? "Started new board");
        return { ok: true };
      } catch (error) {
        console.error("Failed to initialize new board session", error);
        return {
          ok: false,
          error:
            "Current board saved, but starting a new board failed. Try reloading the app.",
        };
      }
    },
    [saveDraft, setActiveFilePath, setCanvasState, setSaveMessage],
  );

  const handleNewBoardRequest = useCallback(() => {
    if (isNewBoardWorking) {
      return;
    }
    setNewBoardError(null);
    setIsNewBoardDialogOpen(true);
  }, [isNewBoardWorking]);

  const handleNewBoardCancel = useCallback(() => {
    if (isNewBoardWorking) {
      return;
    }
    setIsNewBoardDialogOpen(false);
  }, [isNewBoardWorking]);

  const handleNewBoardConfirm = useCallback(async () => {
    if (isNewBoardWorking) {
      return;
    }

    setNewBoardError(null);
    setIsNewBoardWorking(true);

    const snapshot = getCurrentSnapshot();
    const saveResult = await performPreResetSave(snapshot);
    if (!saveResult.ok) {
      setNewBoardError(saveResult.error);
      setIsNewBoardWorking(false);
      return;
    }

    let completionMessage: string | undefined;

    if (dataChannelState === "open") {
      const { sent } = broadcastNewBoard();
      if (!sent) {
        completionMessage =
          "Started new board (collaborators may not have been notified)";
      }
    }

    const initResult = await initializeBlankBoard({
      message: completionMessage,
    });
    if (!initResult.ok) {
      setNewBoardError(initResult.error);
      setIsNewBoardWorking(false);
      return;
    }

    setIsNewBoardWorking(false);
  }, [
    broadcastNewBoard,
    dataChannelState,
    getCurrentSnapshot,
    initializeBlankBoard,
    isNewBoardWorking,
    performPreResetSave,
    setSaveMessage,
  ]);

  React.useEffect(() => {
    if (!incomingNewBoard) {
      return;
    }

    let isActive = true;

    clearIncomingNewBoard(incomingNewBoard.sessionId);
    setRemoteNewBoardSessionId(incomingNewBoard.sessionId);
    setRemoteNewBoardError(null);
    setIsRemoteNewBoardModalOpen(true);
    setIsRemoteNewBoardWorking(true);

    const snapshot = getCurrentSnapshot();

    const process = async () => {
      const saveResult = await performPreResetSave(snapshot);
      if (!isActive) {
        return;
      }
      if (!saveResult.ok) {
        setRemoteNewBoardError(saveResult.error);
        return;
      }

      const initResult = await initializeBlankBoard({
        message: "New board started (collaboration)",
      });
      if (!isActive) {
        return;
      }
      if (!initResult.ok) {
        setRemoteNewBoardError(initResult.error);
        return;
      }

      setIsRemoteNewBoardWorking(false);
      setIsRemoteNewBoardModalOpen(false);
      setRemoteNewBoardSessionId(null);
    };

    process()
      .catch((error) => {
        console.error("Failed to process collaborator new board", error);
        if (isActive) {
          setRemoteNewBoardError(
            "We could not start the new board from your collaborator.",
          );
        }
      })
      .finally(() => {
        if (isActive) {
          setIsRemoteNewBoardWorking(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [
    clearIncomingNewBoard,
    getCurrentSnapshot,
    incomingNewBoard,
    initializeBlankBoard,
    performPreResetSave,
  ]);

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
        : new Date(parsed).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
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
    return [draftStatus, saveMessage, settingsMessage]
      .filter(Boolean)
      .join(" · ");
  }, [draftStatus, saveMessage, settingsMessage]);

  // Listen for Cmd+S / Ctrl+S to open save modal
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSaveShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
      if (!isSaveShortcut) {
        return;
      }

      // Ignore shortcut if user is typing in an input/textarea/contenteditable
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
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
  const handleProviderKeyChange = useCallback(
    (provider: AiProvider, value: string) => {
      setProviderKeys((previous) => ({
        ...previous,
        [provider]: value,
      }));
    },
    [],
  );

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

  const handlePrepromptSave = useCallback(() => {
    try {
      window.settingsStore.setPreprompt(prepromptText);
      setPrepromptStatus({ message: "Preprompt saved.", tone: "success" });
    } catch (error) {
      console.error("Failed to save preprompt", error);
      setPrepromptStatus({
        message: "Failed to save preprompt. Please try again.",
        tone: "error",
      });
    }
  }, [prepromptText]);

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
      const formatted = Number.isNaN(updatedAt)
        ? draft.updatedAt
        : new Date(updatedAt).toLocaleTimeString();
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
      const enabledProviders: AiProvider[] = [];
      let gatewayFallbackEnabled = false;

      AI_PROVIDER_METADATA.forEach(({ value: provider }) => {
        const rawKey = providerKeys[provider] ?? "";
        const trimmedKey = rawKey.trim();

        window.settingsStore.setProvider(provider, {
          apiKey: trimmedKey,
        });

        if (trimmedKey) {
          enabledProviders.push(provider);
        }
      });

      AI_GATEWAY_METADATA.forEach(({ value: gateway }) => {
        const current = gatewaySettings[gateway];
        const apiKey = current?.apiKey?.trim();
        const referer = current?.referer?.trim();
        const title = current?.title?.trim();

        window.settingsStore.setGateway(gateway, {
          apiKey: apiKey ?? "",
          useForAllModels: current?.useForAllModels ?? false,
          headers:
            referer || title
              ? {
                  ...(referer ? { referer } : {}),
                  ...(title ? { title } : {}),
                }
              : undefined,
        });

        if (apiKey && current?.useForAllModels) {
          gatewayFallbackEnabled = true;
        }
      });

      // Notify any open selects that availability changed (avoids stale dropdown state).
      window.dispatchEvent(
        new CustomEvent(LLM_PROVIDER_KEYS_UPDATED_EVENT, {
          detail: {
            enabledProviders,
            gatewayFallbackEnabled,
          },
        }),
      );

      setIsSettingsOpen(false);
      setSettingsMessage("Settings saved locally.");
    } catch (error) {
      console.error("Failed to persist API keys", error);
      setSettingsMessage("Unable to save API keys. Please try again.");
    }
  };

  return (
    <div className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/75 border-b shadow-sm backdrop-blur">
      <div className="flex max-w-5xl items-center justify-between gap-3 px-4">
        <Menubar className="border-none bg-transparent p-0 shadow-none">
          <MenubarMenu>
            <MenubarTrigger>{i18n.t("menuBar.file")}</MenubarTrigger>
            <MenubarContent>
              <MenubarItem
                disabled={isNewBoardWorking}
                onClick={handleNewBoardRequest}
              >
                {i18n.t("menuBar.newBoard")}
              </MenubarItem>
              <MenubarItem onClick={handleLoadClick}>
                {i18n.t("menuBar.load")}
              </MenubarItem>
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
              <MenubarItem onClick={() => setIsPrepromptModalOpen(true)}>
                {i18n.t("menuBar.preprompt")}
              </MenubarItem>
              <MenubarItem
                onClick={() => setStatsForNerdsEnabled(!statsForNerdsEnabled)}
              >
                {statsForNerdsEnabled
                  ? i18n.t("menuBar.statsForNerdsEnabled")
                  : i18n.t("menuBar.statsForNerdsDisabled")}
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Connect</MenubarTrigger>
            <MenubarContent>
              <MenubarItem
                onClick={() => {
                  setIsPeerConnectionOpen(true);
                  setConnectionRole("initiator");
                }}
              >
                Connect as Initiator
              </MenubarItem>
              <MenubarItem
                onClick={() => {
                  setIsPeerConnectionOpen(true);
                  setConnectionRole("responder");
                }}
              >
                Connect as Responder
              </MenubarItem>
              <MenubarItem onClick={() => requestSync?.()}>Resync</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>{i18n.t("menuBar.help")}</MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={() => setIsAboutOpen(true)}>
                {i18n.t("menuBar.about")}
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
        <div className="flex items-center gap-3">
          {connectionStatus ? (
            <span
              className={`text-sm font-medium ${connectionStatus.className}`}
            >
              {connectionStatus.label}
            </span>
          ) : null}
          {combinedStatus ? (
            <span className="text-muted-foreground text-sm">
              {combinedStatus}
            </span>
          ) : null}
        </div>
      </div>

      <Dialog
        open={isNewBoardDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setNewBoardError(null);
            setIsNewBoardDialogOpen(true);
          } else {
            handleNewBoardCancel();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new board?</DialogTitle>
            <DialogDescription>
              We{"'"}ll auto-save the current board first, then reset to a blank
              canvas.
            </DialogDescription>
          </DialogHeader>
          {newBoardError ? (
            <p className="text-destructive text-sm">{newBoardError}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={handleNewBoardCancel}
              disabled={isNewBoardWorking}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleNewBoardConfirm}
              disabled={isNewBoardWorking}
            >
              {isNewBoardWorking ? "Starting…" : "Start New Board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      <Dialog
        open={isRemoteNewBoardModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsRemoteNewBoardModalOpen(false);
            setRemoteNewBoardError(null);
            setRemoteNewBoardSessionId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Collaborator starting a new board</DialogTitle>
            <DialogDescription>
              We{"'"}ll save the current board, then reset to a blank canvas.
              {remoteNewBoardSessionId
                ? ` (Session ${remoteNewBoardSessionId.slice(0, 6)})`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {remoteNewBoardError ? (
            <p className="text-destructive text-sm">{remoteNewBoardError}</p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Preparing the new board with your collaborator…
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsRemoteNewBoardModalOpen(false);
                setRemoteNewBoardError(null);
                setRemoteNewBoardSessionId(null);
              }}
            >
              {remoteNewBoardError
                ? "Close"
                : isRemoteNewBoardWorking
                  ? "Dismiss"
                  : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      />

      <PrepromptModal
        isOpen={isPrepromptModalOpen}
        value={prepromptText}
        onChange={(value) => {
          setPrepromptText(value);
          setPrepromptStatus(null);
        }}
        onCancel={() => {
          setIsPrepromptModalOpen(false);
          setPrepromptStatus(null);
        }}
        onSave={handlePrepromptSave}
        statusMessage={prepromptStatus?.message}
        statusTone={prepromptStatus?.tone}
      />

      <PeerConnectionModal
        isOpen={isPeerConnectionOpen}
        onClose={() => setIsPeerConnectionOpen(false)}
        role={connectionRole}
      />
    </div>
  );
}
