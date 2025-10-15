import { BrowserWindow } from "electron";
import { addThemeEventListeners } from "./theme/theme-listeners";
import { addWindowEventListeners } from "./window/window-listeners";
import { addPakEventListeners } from "./pak/pak-listeners";
import { addDialogEventListeners } from "./dialog/dialog-listeners";

export default function registerListeners(mainWindow: BrowserWindow) {
  addWindowEventListeners(mainWindow);
  addThemeEventListeners();
  addPakEventListeners();
  addDialogEventListeners();
}
