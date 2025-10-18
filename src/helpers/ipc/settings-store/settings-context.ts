import { contextBridge } from "electron";
import Store from "electron-store";
import type { AiGateway, AiProvider } from "../../core/llm/aiModels";

type ProviderSettingsValue = { apiKey: string };

type GatewaySettingsValue = {
  apiKey: string;
  useForAllModels: boolean;
  headers?: {
    referer?: string;
    title?: string;
  };
};

const providerSettingsStore = new Store<Record<AiProvider, ProviderSettingsValue>>({
  name: "model-api-keys",
  defaults: {},
});

const gatewaySettingsStore = new Store<Record<AiGateway, GatewaySettingsValue>>({
  name: "gateway-api-keys",
  defaults: {},
});

export function exposeSettingsContext() {
  contextBridge.exposeInMainWorld("settingsStore", {
    getProvider: (key: AiProvider) => providerSettingsStore.get(key) as
      | ProviderSettingsValue
      | undefined,
    setProvider: (key: AiProvider, value: ProviderSettingsValue) => {
      providerSettingsStore.set(key, value);
    },
    getGateway: (key: AiGateway) => gatewaySettingsStore.get(key) as
      | GatewaySettingsValue
      | undefined,
    setGateway: (key: AiGateway, value: GatewaySettingsValue) => {
      gatewaySettingsStore.set(key, value);
    },
  });
}
