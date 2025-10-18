import { app, BrowserWindow, Menu } from "electron";
import Store from "electron-store";
import registerListeners from "./helpers/ipc/listeners-register";

Store.initRenderer();
// "electron-squirrel-startup" seems broken when packaging with vite
//import started from "electron-squirrel-startup";
import path from "path";
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";

const inDevelopment = process.env.NODE_ENV === "development";
const APP_TITLE = "DeepElegant - kavim";

app.setName(APP_TITLE);

function resolveAsset(fileName: string) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets", fileName);
  }

  return path.join(__dirname, "..", "..", "assets", fileName);
}

function getIcon() {
  return resolveAsset(process.platform === "darwin" ? "icon.png" : "icon.ico");
}

function configureMacApp(iconPath: string) {
  if (process.platform !== "darwin") {
    return;
  }

  app.dock?.setIcon(iconPath);
  app.setAboutPanelOptions({
    applicationName: APP_TITLE,
  });

  const menu = Menu.buildFromTemplate([
    {
      label: APP_TITLE,
      submenu: [
        { role: "about", label: `About ${APP_TITLE}` },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide", label: `Hide ${APP_TITLE}` },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: `Quit ${APP_TITLE}` },
      ],
    },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    { role: "help", submenu: [] },
  ]);

  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const preload = path.join(__dirname, "preload.js");
  const iconPath = getIcon();

  configureMacApp(iconPath);

  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: APP_TITLE,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,

      preload: preload,
    },
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition:
      process.platform === "darwin" ? { x: 5, y: 5 } : undefined,
    icon: iconPath,
  });
  mainWindow.setTitle(APP_TITLE);
  registerListeners(mainWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  mainWindow.webContents.openDevTools({ mode: 'detach'});
}

async function installExtensions() {
  try {
    const result = await installExtension(REACT_DEVELOPER_TOOLS);
    console.log(`Extensions installed successfully: ${result.name}`);
  } catch {
    console.error("Failed to install extensions");
  }
}

app.whenReady().then(createWindow).then(installExtensions);

//osX only
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
//osX only ends
