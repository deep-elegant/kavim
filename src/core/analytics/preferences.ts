export type AnalyticsPreferences = {
  disableAnalytics: boolean;
  consentVersion: number;
};

export const ANALYTICS_POLICY_VERSION = 1;

export const DEFAULT_ANALYTICS_PREFERENCES: AnalyticsPreferences = {
  disableAnalytics: false,
  consentVersion: 0,
};

const isNumeric = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const normalizePreferences = (
  input?: Partial<AnalyticsPreferences>,
): AnalyticsPreferences => ({
  disableAnalytics: Boolean(input?.disableAnalytics),
  consentVersion: isNumeric(input?.consentVersion)
    ? input!.consentVersion
    : DEFAULT_ANALYTICS_PREFERENCES.consentVersion,
});

export const mergePreferences = (
  current: AnalyticsPreferences,
  updates: Partial<AnalyticsPreferences>,
) => normalizePreferences({ ...current, ...updates });

export const hasCurrentConsent = (prefs: AnalyticsPreferences) =>
  prefs.consentVersion >= ANALYTICS_POLICY_VERSION;

export const isTrackingAllowed = (prefs: AnalyticsPreferences) =>
  hasCurrentConsent(prefs) && !prefs.disableAnalytics;
