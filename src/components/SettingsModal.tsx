import React from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AI_GATEWAY_METADATA,
  AI_PROVIDER_METADATA,
  type AiGateway,
  type AiProvider,
} from "@/core/llm/aiModels";

type ProviderKeyValue = {
  apiKey: string;
  baseURL?: string;
  model?: string;
};

type ProviderKeyMap = Record<AiProvider, ProviderKeyValue>;

type ProviderVisibilityMap = Record<AiProvider, boolean>;

/** Creates initial visibility state for all provider keys (hidden by default). */
const createInitialVisibilityMap = (): ProviderVisibilityMap =>
  AI_PROVIDER_METADATA.reduce((accumulator, provider) => {
    accumulator[provider.value] = false;
    return accumulator;
  }, {} as ProviderVisibilityMap);

type GatewayVisibilityMap = Record<AiGateway, boolean>;

/** Creates initial visibility state for all gateway keys (hidden by default). */
const createInitialGatewayVisibilityMap = (): GatewayVisibilityMap =>
  AI_GATEWAY_METADATA.reduce((accumulator, gateway) => {
    accumulator[gateway.value] = false;
    return accumulator;
  }, {} as GatewayVisibilityMap);

/**
 * Form state for a single AI gateway configuration.
 * - `useForAllModels` enables routing all requests through this gateway.
 * - `referer` and `title` are optional HTTP headers for gateway authentication.
 */
type GatewaySettingsValue = {
  apiKey: string;
  useForAllModels: boolean;
  referer: string;
  title: string;
};

type GatewaySettingsMap = Record<AiGateway, GatewaySettingsValue>;

/**
 * Modal for managing AI provider and gateway API keys.
 * - Providers tab: direct API keys for OpenAI, DeepSeek, Anthropic, etc.
 * - Gateways tab: keys for multi-provider gateways like OpenRouter.
 * - Keys are stored locally via electron-store (not secure for production).
 */
interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerKeys: ProviderKeyMap;
  setProviderKey: (
    provider: AiProvider,
    value: Partial<ProviderKeyValue>,
  ) => void;
  gatewaySettings: GatewaySettingsMap;
  setGatewaySetting: (
    gateway: AiGateway,
    updates: Partial<GatewaySettingsValue>,
  ) => void;
  handleSettingsSave: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  providerKeys,
  setProviderKey,
  gatewaySettings,
  setGatewaySetting,
  handleSettingsSave,
}) => {
  // Track visibility state for password fields (local UI state only)
  const [visibleProviders, setVisibleProviders] =
    React.useState<ProviderVisibilityMap>(() => createInitialVisibilityMap());
  const [visibleGateways, setVisibleGateways] =
    React.useState<GatewayVisibilityMap>(() =>
      createInitialGatewayVisibilityMap(),
    );
  const [activeTab, setActiveTab] = React.useState<"providers" | "gateways">(
    "providers",
  );
  const [initialProviderKeys, setInitialProviderKeys] =
    React.useState<ProviderKeyMap | null>(null);
  const [initialGatewaySettings, setInitialGatewaySettings] =
    React.useState<GatewaySettingsMap | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = React.useState(false);

  // Reset UI state when modal closes to avoid leaking visible passwords
  React.useEffect(() => {
    if (!isOpen) {
      setVisibleProviders(createInitialVisibilityMap());
      setVisibleGateways(createInitialGatewayVisibilityMap());
      setActiveTab("providers");
      setInitialProviderKeys(null);
      setInitialGatewaySettings(null);
      setShowUnsavedDialog(false);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (isOpen && !initialProviderKeys && !initialGatewaySettings) {
      setInitialProviderKeys(providerKeys);
      setInitialGatewaySettings(gatewaySettings);
    }
  }, [
    gatewaySettings,
    initialGatewaySettings,
    initialProviderKeys,
    isOpen,
    providerKeys,
  ]);

  const hasUnsavedChanges = React.useMemo(() => {
    if (!initialProviderKeys || !initialGatewaySettings) {
      return false;
    }
    return (
      JSON.stringify(providerKeys) !== JSON.stringify(initialProviderKeys) ||
      JSON.stringify(gatewaySettings) !== JSON.stringify(initialGatewaySettings)
    );
  }, [gatewaySettings, initialGatewaySettings, initialProviderKeys, providerKeys]);

  const handleRequestClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
      return;
    }
    onClose();
  };

  /** Toggle visibility of a provider's API key field. */
  const toggleProviderVisibility = (provider: AiProvider) => {
    setVisibleProviders((previous) => ({
      ...previous,
      [provider]: !previous[provider],
    }));
  };

  /** Toggle visibility of a gateway's API key field. */
  const toggleGatewayVisibility = (gateway: AiGateway) => {
    setVisibleGateways((previous) => ({
      ...previous,
      [gateway]: !previous[gateway],
    }));
  };

  /** Renders the provider API keys tab with individual text inputs. */
  const renderProviderTab = () => (
    <div className="space-y-2">
      {AI_PROVIDER_METADATA.map(
        ({ value: provider, label, inputPlaceholder }) => {
          const isVisible = visibleProviders[provider];
          const providerKey = providerKeys[provider]?.apiKey ?? "";

          return (
            <div
              key={provider}
              className="border-border rounded-md border p-3 text-sm"
            >
              <div className="mb-2 font-medium">{label}</div>
              {provider === "openai-compatible" ? (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Endpoint must be OpenAI-compatible (e.g., Ollama
                    /v1). Fill endpoint and model to enable; API key is optional.
                  </div>
                  <label className="flex flex-col gap-1">
                    Endpoint URL
                    <input
                      value={providerKeys[provider]?.baseURL ?? ""}
                      onChange={(event) =>
                        setProviderKey(provider, {
                          ...providerKeys[provider],
                          baseURL: event.target.value,
                        })
                      }
                      type="text"
                      className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
                      placeholder="http://localhost:11434/v1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Model name
                    <input
                      value={providerKeys[provider]?.model ?? ""}
                      onChange={(event) =>
                        setProviderKey(provider, {
                          ...providerKeys[provider],
                          model: event.target.value,
                        })
                      }
                      type="text"
                      className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
                      placeholder="llama3.1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    API Key (optional)
                    <div className="relative">
                      <input
                        value={providerKeys[provider]?.apiKey ?? ""}
                        onChange={(event) =>
                          setProviderKey(provider, {
                            ...providerKeys[provider],
                            apiKey: event.target.value,
                          })
                        }
                        type={isVisible ? "text" : "password"}
                        className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 pr-10 text-sm shadow-sm focus:ring-2 focus:outline-none"
                        placeholder={inputPlaceholder}
                      />
                      <button
                        type="button"
                        onClick={() => toggleProviderVisibility(provider)}
                        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-2 flex items-center"
                        aria-label={
                          isVisible
                            ? `Hide ${label} API key`
                            : `Show ${label} API key`
                        }
                      >
                        {isVisible ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </label>
                </div>
              ) : (
                <label className="flex flex-col gap-1">
                  API Key
                  <div className="relative">
                    <input
                      value={providerKey}
                      onChange={(event) =>
                        setProviderKey(provider, {
                          ...providerKeys[provider],
                          apiKey: event.target.value,
                        })
                      }
                      type={isVisible ? "text" : "password"}
                      className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 pr-10 text-sm shadow-sm focus:ring-2 focus:outline-none"
                      placeholder={inputPlaceholder}
                    />
                    <button
                      type="button"
                      onClick={() => toggleProviderVisibility(provider)}
                      className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-2 flex items-center"
                      aria-label={
                        isVisible
                          ? `Hide ${label} API key`
                          : `Show ${label} API key`
                      }
                    >
                      {isVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </label>
              )}
            </div>
          );
        },
      )}
    </div>
  );

  /**
   * Renders the gateway settings tab with grouped controls.
   * - Each gateway gets: API key, "use for all models" checkbox, and optional headers.
   */
  const renderGatewayTab = () => (
    <div className="space-y-3">
      {AI_GATEWAY_METADATA.map(
        ({
          value: gateway,
          label,
          description,
          inputPlaceholder,
          headerPlaceholders,
        }) => {
          const gatewayState = gatewaySettings[gateway];
          const isVisible = visibleGateways[gateway];

          return (
            <div
              key={gateway}
              className="border-border space-y-3 rounded-lg border p-3"
            >
              <div className="space-y-1">
                <h3 className="text-sm font-medium">{label}</h3>
                {description ? (
                  <p className="text-muted-foreground text-xs">{description}</p>
                ) : null}
              </div>
              <label className="flex flex-col gap-1 text-sm">
                {label} API Key
                <div className="relative">
                  <input
                    value={gatewayState?.apiKey ?? ""}
                    onChange={(event) =>
                      setGatewaySetting(gateway, { apiKey: event.target.value })
                    }
                    type={isVisible ? "text" : "password"}
                    className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 pr-10 text-sm shadow-sm focus:ring-2 focus:outline-none"
                    placeholder={inputPlaceholder}
                  />
                  <button
                    type="button"
                    onClick={() => toggleGatewayVisibility(gateway)}
                    className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-2 flex items-center"
                    aria-label={
                      isVisible
                        ? `Hide ${label} API key`
                        : `Show ${label} API key`
                    }
                  >
                    {isVisible ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="border-input h-4 w-4 rounded border"
                  checked={gatewayState?.useForAllModels ?? false}
                  onChange={(event) =>
                    setGatewaySetting(gateway, {
                      useForAllModels: event.target.checked,
                    })
                  }
                />
                <span>Use this provider for all models</span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  HTTP Referer (optional)
                  <input
                    value={gatewayState?.referer ?? ""}
                    onChange={(event) =>
                      setGatewaySetting(gateway, {
                        referer: event.target.value,
                      })
                    }
                    type="text"
                    className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
                    placeholder={headerPlaceholders?.referer}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Site title header (optional)
                  <input
                    value={gatewayState?.title ?? ""}
                    onChange={(event) =>
                      setGatewaySetting(gateway, { title: event.target.value })
                    }
                    type="text"
                    className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
                    placeholder={headerPlaceholders?.title}
                  />
                </label>
              </div>
            </div>
          );
        },
      )}
    </div>
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleRequestClose()}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>LLM settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-border bg-muted/40 flex items-center gap-2 rounded-md border p-1">
              <button
                type="button"
                onClick={() => setActiveTab("providers")}
                className={`flex-1 rounded-sm px-3 py-1 text-sm font-medium transition-colors ${
                  activeTab === "providers"
                    ? "bg-background text-foreground shadow"
                    : "text-muted-foreground"
                }`}
              >
                Provider keys
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("gateways")}
                className={`flex-1 rounded-sm px-3 py-1 text-sm font-medium transition-colors ${
                  activeTab === "gateways"
                    ? "bg-background text-foreground shadow"
                    : "text-muted-foreground"
                }`}
              >
                Gateway keys
              </button>
            </div>
            {activeTab === "providers"
              ? renderProviderTab()
              : activeTab === "gateways"
                ? renderGatewayTab()
                : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={handleRequestClose}>
              Cancel
            </Button>
            <Button onClick={handleSettingsSave}>Save settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={showUnsavedDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowUnsavedDialog(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You have unsaved changes. Save them before closing?
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowUnsavedDialog(false);
                onClose();
              }}
            >
              Discard changes
            </Button>
            <Button
              onClick={() => {
                setShowUnsavedDialog(false);
                handleSettingsSave();
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
