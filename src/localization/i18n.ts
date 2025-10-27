import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  fallbackLng: "en",
  resources: {
    en: {
      translation: {
        menuBar: {
          file: "File",
          newBoard: "New Board",
          load: "Load",
          save: "Save",
          saveDraft: "Save Draft",
          llm: "LLM",
          preprompt: "Conversation preprompt",
          settings: "Settings",
          statsForNerdsEnabled: "Stats for Nerds (Disable)",
          statsForNerdsDisabled: "Stats for Nerds (Enable)",
          help: "Help",
          about: "About",
          aboutDescription: "You're running {{appName}}.",
          versionLabel: "Version {{version}}",
          versionLoading: "Loading version…",
          versionError: "Unable to load version information.",
          close: "Close",
        },
        appName: "DeepElegant - Kavim",
      },
    },
  },
});
