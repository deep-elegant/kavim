import { exposeWindowContext } from "./window/window-context";
import { exposePakContext } from "./pak/pak-context";
import { exposeFileSystemContext } from "./file-system/file-system-context";
import { exposeSettingsContext } from "./settings-store/settings-context";

export default function exposeContexts() {
  exposeWindowContext();
  exposePakContext();
  exposeFileSystemContext();
  exposeSettingsContext();
}
