import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  fallbackLng: "en",
  resources: {
    en: {
      translation: {
        menuBar: {
          file: "File",
          load: "Load",
          save: "Save",
          saveDraft: "Save Draft",
          llm: "LLM",
          settings: "Settings",
        },
        appName: "DeepElegant - Kavim",
      },
    },
  },
});
