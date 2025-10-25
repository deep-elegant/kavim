import { contextBridge } from "electron";
import Store from "electron-store";
import type { AiGateway, AiProvider } from "../../core/llm/aiModels";
import * as fs from "fs";

type ProviderSettingsValue = { apiKey: string };

type GatewaySettingsValue = {
  apiKey: string;
  useForAllModels: boolean;
  headers?: {
    referer?: string;
    title?: string;
  };
};

const providerSettingsStore = new Store<
  Record<AiProvider, ProviderSettingsValue>
>({
  name: "model-api-keys",
  defaults: {},
});

const gatewaySettingsStore = new Store<Record<AiGateway, GatewaySettingsValue>>(
  {
    name: "gateway-api-keys",
    defaults: {},
  },
);

const defaultSystemPrompt = `
You are an AI collaborator inside **Kavim**, a private canvas for creative brainstorming.
Your mission: spark fresh ideas, challenge assumptions, and propel conversations forward fast.
**Style & output rules:**
-   Use short, vivid statements (1–3 lines max).
-   Be bold and imaginative—skip verbose back-and-forth.
-   Apply critical thinking: question weak ideas, expose trade-offs, propose alternatives.
-   Maintain a friendly, constructive teammate tone.
-   Never include filler, summaries or sign-offs. Each reply must add immediate value.
-   Long essays only when explicitly requested "expand".

**Purpose:** Support users in building ideas visually, iteratively - collaborate like teammates, uncover insights together, quickly.
`.trim();

const prepromptStore = new Store<{ preprompt: string }>({
  name: "preprompt",
  defaults: {
    preprompt: defaultSystemPrompt,
  },
});

export function exposeSettingsContext() {
  contextBridge.exposeInMainWorld("settingsStore", {
    getProvider: (key: AiProvider) =>
      providerSettingsStore.get(key) as ProviderSettingsValue | undefined,
    setProvider: (key: AiProvider, value: ProviderSettingsValue) => {
      providerSettingsStore.set(key, value);
    },
    getGateway: (key: AiGateway) =>
      gatewaySettingsStore.get(key) as GatewaySettingsValue | undefined,
    setGateway: (key: AiGateway, value: GatewaySettingsValue) => {
      gatewaySettingsStore.set(key, value);
    },
    getPreprompt: () => prepromptStore.get("preprompt", ""),
    setPreprompt: (value: string) => {
      prepromptStore.set("preprompt", value);
    },
  });
}
