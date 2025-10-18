import { contextBridge } from "electron";
import Store from "electron-store";
import type { AiProvider } from "../../core/llm/aiModels";

type ProviderSettingsValue = { apiKey: string };

const modelSettingsStore = new Store<Record<AiProvider, ProviderSettingsValue>>({
  name: "model-api-keys",
  defaults: {},
});

export function exposeSettingsContext() {
  contextBridge.exposeInMainWorld("settingsStore", {
    get: (key: AiProvider) => modelSettingsStore.get(key) as
      | ProviderSettingsValue
      | undefined,
    set: (key: AiProvider, value: ProviderSettingsValue) => {
      modelSettingsStore.set(key, value);
    },
  });
}
