import { BrowserWindow } from "electron";
import { addThemeEventListeners } from "./theme/theme-listeners";
import { addWindowEventListeners } from "./window/window-listeners";
import { addPakEventListeners } from "./pak/pak-listeners";
import { addFileSystemEventListeners } from "./file-system/file-system-listeners";

export default function registerListeners(mainWindow: BrowserWindow) {
  addWindowEventListeners(mainWindow);
  addThemeEventListeners();
  addPakEventListeners();
  addFileSystemEventListeners();
}
