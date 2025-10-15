import { ipcMain, dialog, app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  OPEN_DIRECTORY_DIALOG_CHANNEL,
  OPEN_FILE_DIALOG_CHANNEL,
  READ_FILE_AS_DATA_URL_CHANNEL,
  SAVE_CLIPBOARD_IMAGE_CHANNEL,
} from './file-system-channels';

const mimeTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};

const guessMimeType = (filePath: string) => {
  const extension = path.extname(filePath).toLowerCase();
  return mimeTypes[extension] ?? "application/octet-stream";
};

export const addFileSystemEventListeners = () => {
  ipcMain.handle(READ_FILE_AS_DATA_URL_CHANNEL, async (_, filePath: string) => {
    const buffer = await fs.readFile(filePath);
    const mimeType = guessMimeType(filePath);
    const base64 = buffer.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  });
  ipcMain.handle(
    OPEN_FILE_DIALOG_CHANNEL,
    async (_, options?: DialogOpenFileOptions) => {
      const dialogOptions: Electron.OpenDialogOptions = {
        properties: ["openFile"],
        filters: options?.filters ?? [
          { name: "Pak Files", extensions: ["pak"] },
        ],
      };

      const result = await dialog.showOpenDialog(dialogOptions);
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0]; // this is the real absolute path
    },
  );
  ipcMain.handle(OPEN_DIRECTORY_DIALOG_CHANNEL, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0]; // this is the real absolute path
  });
  ipcMain.handle(
    SAVE_CLIPBOARD_IMAGE_CHANNEL,
    async (_, base64Data: string, extension: string) => {
      const buffer = Buffer.from(base64Data, 'base64');
      const userDataPath = app.getPath('userData');
      const imagesDir = path.join(userDataPath, 'pasted-images');
      await fs.mkdir(imagesDir, { recursive: true });
      const fileName = `${Date.now()}.${extension}`;
      const filePath = path.join(imagesDir, fileName);
      await fs.writeFile(filePath, buffer);
      return filePath;
    },
  );
};
