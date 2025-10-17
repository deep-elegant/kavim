import type { AiProvider } from '../../core/llm/aiModels';

type ProviderSettingsValue = { apiKey: string };

export function exposeSettingsContext() {
  const { contextBridge } = window.require('electron') as typeof import('electron');
  const storeModule = window.require('electron-store') as typeof import('electron-store');
  const Store = ('default' in storeModule ? storeModule.default : storeModule) as typeof storeModule.default;

  const modelSettingsStore = new Store<Record<AiProvider, ProviderSettingsValue>>({
    name: 'model-api-keys',
    defaults: {},
  });

  contextBridge.exposeInMainWorld('settingsStore', {
    get: (key: AiProvider) => modelSettingsStore.get(key) as ProviderSettingsValue | undefined,
    set: (key: AiProvider, value: ProviderSettingsValue) => {
      modelSettingsStore.set(key, value);
    },
  });
}
