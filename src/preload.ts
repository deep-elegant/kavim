import { contextBridge } from "electron";
import Store from "electron-store";
import exposeContexts from "./helpers/ipc/context-exposer";

const modelSettingsStore = new Store({
  name: "model-api-keys",
  defaults: {},
});

contextBridge.exposeInMainWorld("settingsStore", {
  get: (key: "deepseek" | "chatgpt") => modelSettingsStore.get(key),
  set: (key: "deepseek" | "chatgpt", value: { apiKey: string }) => {
    modelSettingsStore.set(key, value);
  },
});

exposeContexts();
