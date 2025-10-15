import { exposeThemeContext } from "./theme/theme-context";
import { exposeWindowContext } from "./window/window-context";
import { exposePakContext } from "./pak/pak-context";
import { exposeDialogContext } from "./dialog/dialog-context";

export default function exposeContexts() {
  exposeWindowContext();
  exposeThemeContext();
  exposeDialogContext();
  exposePakContext();
}
