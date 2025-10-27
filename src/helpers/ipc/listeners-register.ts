import { BrowserWindow } from "electron";
import { addWindowEventListeners } from "./window/window-listeners";
import { addPakEventListeners } from "./pak/pak-listeners";
import { addFileSystemEventListeners } from "./file-system/file-system-listeners";
import { addLlmEventListeners } from "./llm/llm-listeners";
import { addDraftEventListeners } from "./drafts/draft-listeners";
import { addAppEventListeners } from "./app/app-listeners";

export default function registerListeners(mainWindow: BrowserWindow) {
  addWindowEventListeners(mainWindow);
  addPakEventListeners();
  addFileSystemEventListeners();
  addLlmEventListeners();
  addDraftEventListeners();
  addAppEventListeners();
}
