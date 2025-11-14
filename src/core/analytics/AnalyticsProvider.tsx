import React from "react";
import { toast } from "sonner";
import { AnalyticsConsentDialog } from "@/components/AnalyticsConsentDialog";
import { trackPageView, isDoNotTrackEnabled } from ".";
import {
  ANALYTICS_POLICY_VERSION,
  type AnalyticsPreferences,
  DEFAULT_ANALYTICS_PREFERENCES,
} from "./preferences";
import { requiresExplicitOptInForLocale } from "./region";

const PRIVACY_POLICY_URL = "https://kavim.deepelegant.com/privacy-policy.html";

type AnalyticsContextValue = {
  preferences: AnalyticsPreferences;
  analyticsAllowed: boolean;
  analyticsActive: boolean;
  doNotTrackEnabled: boolean;
  needsConsent: boolean;
  requiresExplicitOptIn: boolean;
  configPath?: string;
  policyVersion: number;
  privacyPolicyUrl: string;
  refreshPreferences: () => void;
  updatePreferences: (
    updates: Partial<AnalyticsPreferences>,
  ) => AnalyticsPreferences | null;
  setAnalyticsEnabled: (enabled: boolean) => AnalyticsPreferences | null;
};

const AnalyticsPreferencesContext = React.createContext<
  AnalyticsContextValue | undefined
>(undefined);

const readPreferences = () =>
  window.analyticsGuard?.getPreferences?.() ?? DEFAULT_ANALYTICS_PREFERENCES;

export function AnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const policyVersion =
    window.analyticsGuard?.policyVersion ?? ANALYTICS_POLICY_VERSION;
  const configPath = window.analyticsGuard?.configPath;

  const [preferences, setPreferences] = React.useState<AnalyticsPreferences>(
    () => readPreferences(),
  );

  const doNotTrackEnabled = isDoNotTrackEnabled();
  const hasConsent = preferences.consentVersion >= policyVersion;
  const analyticsAllowed = hasConsent && !preferences.disableAnalytics;
  const analyticsActive = analyticsAllowed && !doNotTrackEnabled;
  const needsConsent = preferences.consentVersion < policyVersion;
  const requiresExplicitOptIn = requiresExplicitOptInForLocale(
    typeof navigator !== "undefined" ? navigator.language : undefined,
  );

  const trackedInitialViewRef = React.useRef(false);

  React.useEffect(() => {
    if (analyticsActive && !trackedInitialViewRef.current) {
      trackPageView();
      trackedInitialViewRef.current = true;
    }
  }, [analyticsActive]);

  const handlePreferencesUpdate = React.useCallback(
    (updates: Partial<AnalyticsPreferences>) => {
      try {
        if (!window.analyticsGuard?.setPreferences) {
          throw new Error("Analytics guard unavailable");
        }
        const next = window.analyticsGuard.setPreferences(updates);
        setPreferences(next);
        return next;
      } catch (error) {
        console.error("Failed to update analytics preferences", error);
        toast.error("Unable to save analytics preference.");
        return null;
      }
    },
    [],
  );

  const setAnalyticsEnabled = React.useCallback(
    (enabled: boolean) => {
      const nextConsentVersion = Math.max(preferences.consentVersion, policyVersion);
      return handlePreferencesUpdate({
        disableAnalytics: !enabled,
        consentVersion: enabled ? policyVersion : nextConsentVersion,
      });
    },
    [handlePreferencesUpdate, policyVersion, preferences.consentVersion],
  );

  const refreshPreferences = React.useCallback(() => {
    try {
      if (!window.analyticsGuard?.reloadPreferences) {
        return;
      }
      const reloaded = window.analyticsGuard.reloadPreferences();
      setPreferences(reloaded);
    } catch (error) {
      console.warn("Unable to reload analytics preferences", error);
    }
  }, []);

  const contextValue = React.useMemo<AnalyticsContextValue>(() => {
    return {
      preferences,
      analyticsAllowed,
      analyticsActive,
      doNotTrackEnabled,
      needsConsent,
      requiresExplicitOptIn,
      configPath,
      policyVersion,
      privacyPolicyUrl: PRIVACY_POLICY_URL,
      refreshPreferences,
      updatePreferences: handlePreferencesUpdate,
      setAnalyticsEnabled,
    };
  }, [
    analyticsActive,
    analyticsAllowed,
    configPath,
    doNotTrackEnabled,
    handlePreferencesUpdate,
    needsConsent,
    policyVersion,
    preferences,
    refreshPreferences,
    requiresExplicitOptIn,
    setAnalyticsEnabled,
  ]);

  const handleAllow = () => setAnalyticsEnabled(true);
  const handleDecline = () => setAnalyticsEnabled(false);

  return (
    <AnalyticsPreferencesContext.Provider value={contextValue}>
      {children}
      <AnalyticsConsentDialog
        open={needsConsent}
        onAllow={handleAllow}
        onDecline={handleDecline}
        requiresExplicitOptIn={requiresExplicitOptIn}
        privacyPolicyUrl={PRIVACY_POLICY_URL}
        configPath={configPath}
      />
    </AnalyticsPreferencesContext.Provider>
  );
}

export const useAnalyticsPreferences = () => {
  const context = React.useContext(AnalyticsPreferencesContext);
  if (!context) {
    throw new Error("useAnalyticsPreferences must be used within AnalyticsProvider");
  }
  return context;
};
