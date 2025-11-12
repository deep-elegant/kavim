type AnalyticsEventData = Record<string, string | number | boolean | null | undefined>;
type AnalyticsClient = NonNullable<Window["umami"]>;

const hasWindow = typeof window !== "undefined";

const shouldTrackInternal = () => {
  if (!hasWindow) {
    return false;
  }

  if (!window.analyticsGuard) {
    return true;
  }

  try {
    return window.analyticsGuard.shouldTrack();
  } catch {
    return !window.analyticsGuard.disabled;
  }
};

const withClient = (callback: (client: AnalyticsClient) => void) => {
  if (!hasWindow) {
    return;
  }

  if (!shouldTrackInternal()) {
    return;
  }

  const client = window.umami;
  if (!client || typeof client.track !== "function") {
    return;
  }

  callback(client);
};

export const analyticsShouldTrack = () => shouldTrackInternal();

export const trackPageView = () => {
  withClient((client) => client.track());
};

export const trackEvent = (
  name: string,
  data?: AnalyticsEventData,
) => {
  if (!name) {
    return;
  }

  withClient((client) => client.track(name, data));
};

export const getAnalyticsOptOutPath = () =>
  hasWindow ? window.analyticsGuard?.configPath : undefined;
