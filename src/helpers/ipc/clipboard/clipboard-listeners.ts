import { ipcMain, clipboard } from "electron";

import { WRITE_CLIPBOARD_TEXT_CHANNEL, READ_CLIPBOARD_TEXT_CHANNEL } from "./clipboard-channels";

export const addClipboardEventListeners = () => {
  ipcMain.handle(WRITE_CLIPBOARD_TEXT_CHANNEL, (_evt, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle(READ_CLIPBOARD_TEXT_CHANNEL, () => {
    return clipboard.readText();
  });
};
