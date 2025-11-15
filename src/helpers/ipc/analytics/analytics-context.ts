import { contextBridge } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import {
  ANALYTICS_POLICY_VERSION,
  type AnalyticsPreferences,
  DEFAULT_ANALYTICS_PREFERENCES,
  isTrackingAllowed,
  mergePreferences,
  normalizePreferences,
} from "../../../core/analytics/preferences";

const CONFIG_FILENAME = ".kavim-analytics.json";

const safeClone = (prefs: AnalyticsPreferences) => ({ ...prefs });

export function exposeAnalyticsContext() {
  const configPath = path.join(os.homedir(), CONFIG_FILENAME);

  const readPreferences = (): AnalyticsPreferences => {
    try {
      if (!fs.existsSync(configPath)) {
        return DEFAULT_ANALYTICS_PREFERENCES;
      }

      const raw = fs.readFileSync(configPath, "utf-8");
      if (!raw.trim()) {
        return DEFAULT_ANALYTICS_PREFERENCES;
      }

      const parsed = JSON.parse(raw);
      return normalizePreferences(parsed);
    } catch (error) {
      console.warn("Unable to read analytics preferences", error);
      return DEFAULT_ANALYTICS_PREFERENCES;
    }
  };

  let cachedPreferences = readPreferences();

  const persistPreferences = (preferences: AnalyticsPreferences) => {
    cachedPreferences = preferences;
    try {
      fs.writeFileSync(configPath, JSON.stringify(preferences, null, 2), {
        encoding: "utf-8",
      });
    } catch (error) {
      console.warn("Unable to write analytics preferences", error);
      throw error;
    }
    return safeClone(cachedPreferences);
  };

  const updatePreferences = (updates: Partial<AnalyticsPreferences>) =>
    persistPreferences(mergePreferences(cachedPreferences, updates));

  const reloadPreferences = () => {
    cachedPreferences = readPreferences();
    return safeClone(cachedPreferences);
  };

  const shouldTrack = () => isTrackingAllowed(cachedPreferences);

  contextBridge.exposeInMainWorld("analyticsGuard", {
    configPath,
    policyVersion: ANALYTICS_POLICY_VERSION,
    shouldTrack,
    getPreferences: () => safeClone(cachedPreferences),
    setPreferences: updatePreferences,
    reloadPreferences,
  });
}
