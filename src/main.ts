import { app, BrowserWindow, Menu } from "electron";
import Store from "electron-store";
import registerListeners from "./helpers/ipc/listeners-register";
import { updateElectronApp } from "update-electron-app";
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

updateElectronApp(); // additional configuration options available

// Initialize renderer process access to electron-store
Store.initRenderer();
import path from "path";
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";

const inDevelopment = process.env.NODE_ENV === "development";
const APP_TITLE = "DeepElegant - Kavim";

app.setName(APP_TITLE);

/**
 * Resolves asset paths differently for development vs packaged app.
 * - Packaged: assets are in resourcesPath
 * - Dev: assets are two levels up from dist
 */
function resolveAsset(fileName: string) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets", fileName);
  }

  return path.join(__dirname, "..", "..", "assets", fileName);
}

/**
 * Returns platform-specific icon path.
 * - macOS uses PNG (better quality for Dock)
 * - Windows uses ICO (supports multiple resolutions)
 */
function getIcon() {
  return resolveAsset(process.platform === "darwin" ? "icon.png" : "icon.ico");
}

/**
 * Configures macOS-specific UI elements.
 * - Sets dock icon and about panel
 * - Creates native menu bar (required on macOS, unlike Windows/Linux)
 */
function configureMacApp(iconPath: string) {
  if (process.platform !== "darwin") {
    return;
  }

  app.dock?.setIcon(iconPath);
  app.setAboutPanelOptions({
    applicationName: APP_TITLE,
  });

  // Build standard macOS menu structure with app-specific labels
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

/**
 * Creates the main application window with platform-specific configurations.
 * - Uses custom title bar for modern UI consistency
 * - Context isolation enabled for security (separates renderer from Node.js)
 */
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
      contextIsolation: true, // Security: isolate renderer from Node.js context
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false, // Prevent iframes from accessing Node APIs

      preload: preload,
    },
    // Custom title bar: macOS uses inset for traffic lights, others fully hidden
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition:
      process.platform === "darwin" ? { x: 5, y: 5 } : undefined,
    icon: iconPath,
  });
  mainWindow.setTitle(APP_TITLE);

  // Register IPC handlers for file system, LLM, drafts, etc.
  registerListeners(mainWindow);

  // Dev: use Vite dev server for HMR, Prod: load built files
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  mainWindow.webContents.openDevTools({ mode: "detach" });
}

/**
 * Installs React DevTools for development debugging.
 * - Non-blocking: failures won't prevent app from running
 */
async function installExtensions() {
  try {
    const result = await installExtension(REACT_DEVELOPER_TOOLS);
    console.log(`Extensions installed successfully: ${result.name}`);
  } catch {
    console.error("Failed to install extensions");
  }
}

app.whenReady().then(createWindow).then(installExtensions);

// macOS: keep app running when all windows closed (standard behavior)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// macOS: recreate window when dock icon clicked with no windows open
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
