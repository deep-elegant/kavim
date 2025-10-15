import { exposeThemeContext } from "./theme/theme-context";
import { exposeWindowContext } from "./window/window-context";
import { exposePakContext } from "./pak/pak-context";
import { exposeFileSystemContext } from "./file-system/file-system-context";

export default function exposeContexts() {
  exposeWindowContext();
  exposeThemeContext();
  exposePakContext();
  exposeFileSystemContext();
}
