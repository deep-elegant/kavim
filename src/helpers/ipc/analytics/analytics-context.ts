import { contextBridge } from "electron";
import fs from "fs";
import os from "os";
import path from "path";

const CONFIG_FILENAME = ".kavim-analytics.json";

export function exposeAnalyticsContext() {
  const configPath = path.join(os.homedir(), CONFIG_FILENAME);

  const loadConfigFlag = () => {
    try {
      if (!fs.existsSync(configPath)) {
        return false;
      }

      const raw = fs.readFileSync(configPath, "utf-8");
      if (!raw.trim()) {
        return false;
      }

      const payload = JSON.parse(raw);
      return Boolean(payload?.disableAnalytics);
    } catch (error) {
      console.warn("Unable to read analytics config", error);
      return false;
    }
  };

  const analyticsDisabled = loadConfigFlag();

  contextBridge.exposeInMainWorld("analyticsGuard", {
    disabled: analyticsDisabled,
    configPath,
    shouldTrack: () => !analyticsDisabled,
  });
}
