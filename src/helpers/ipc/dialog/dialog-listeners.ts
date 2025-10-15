import { ipcMain, dialog } from "electron";
import { OPEN_FILE_DIALOG_CHANNEL } from "./dialog-channels";

export const addDialogEventListeners = () => {
    ipcMain.handle(OPEN_FILE_DIALOG_CHANNEL, async () => {
        const result = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "Pak Files", extensions: ["pak"] }],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0]; // this is the real absolute path
    });
};
