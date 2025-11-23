import { BrowserWindow } from "electron";
import { addWindowEventListeners } from "./window/window-listeners";
import { addPakEventListeners } from "./pak/pak-listeners";
import { addFileSystemEventListeners } from "./file-system/file-system-listeners";
import { addLlmEventListeners } from "./llm/llm-listeners";
import { addDraftEventListeners } from "./drafts/draft-listeners";
import { addAppEventListeners } from "./app/app-listeners";
import { addClipboardEventListeners } from "./clipboard/clipboard-listeners";

let globalListenersRegistered = false;

export default function registerListeners(mainWindow: BrowserWindow) {
  addWindowEventListeners(mainWindow);

  if (globalListenersRegistered) {
    return;
  }

  addPakEventListeners();
  addFileSystemEventListeners();
  addLlmEventListeners();
  addDraftEventListeners();
  addAppEventListeners();
  addClipboardEventListeners();

  globalListenersRegistered = true;
}
