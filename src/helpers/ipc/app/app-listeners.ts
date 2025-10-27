import { app, ipcMain } from "electron";
import { APP_GET_INFO_CHANNEL } from "./app-channels";

export const addAppEventListeners = () => {
  ipcMain.handle(APP_GET_INFO_CHANNEL, () => ({
    version: app.getVersion(),
  }));
};
