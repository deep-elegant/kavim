import { exposeWindowContext } from "./window/window-context";
import { exposePakContext } from "./pak/pak-context";
import { exposeFileSystemContext } from "./file-system/file-system-context";
import { exposeSettingsContext } from "./settings-store/settings-context";
import { exposeLlmContext } from "./llm/llm-context";
import { exposeDraftContext } from "./drafts/draft-context";
import { exposeAppContext } from "./app/app-context";
import { exposeDrawerPreferencesContext } from "./drawer-preferences";

export default function exposeContexts() {
  exposeWindowContext();
  exposePakContext();
  exposeFileSystemContext();
  exposeSettingsContext();
  exposeLlmContext();
  exposeDraftContext();
  exposeAppContext();
  exposeDrawerPreferencesContext();
}
