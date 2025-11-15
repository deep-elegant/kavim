# Analytics Consent & Controls Plan

## Goals
Provide a privacy-friendly analytics flow for Kavim desktop builds:
- gather anonymous usage data only after user consent (opt-in for EU/UK).
- surface clear privacy messaging (link to https://kavim.deepelegant.com/privacy-policy.html).
- let users toggle analytics at any time via settings and the existing `~/.kavim-analytics.json` flag.
- respect browser/OS "Do Not Track" preferences.

## Tasks
1. [ ] **Detect EU/UK locales**
   - Add a lightweight helper (e.g., `src/core/analytics/region.ts`) that inspects `navigator.language` / `app.getLocale()` to classify regions. Prefer a simple ISO country list for EU+UK (no geolocation service needed).
   - Expose the result through preload (e.g., `window.analyticsGuard.region`).
   - Example snippet:
     ```ts
     const euLocales = new Set(["de", "fr", "es", "sv", /* ... */]);
     export const isEuLocale = (locale?: string) => {
       const code = (locale ?? "").split("-")[1]?.toLowerCase();
       return code ? euCountries.has(code) : false;
     };
     ```
   - Document fallback: if locale missing, default to requiring opt-in (safer choice).

2. [ ] **Persist consent alongside analytics flag**
   - Extend `.kavim-analytics.json` to store both `disableAnalytics` and `consentVersion` / `given` state.
   - Build a helper to read/write the file (already read-only today). Add preload APIs to update it when user clicks toggle.
   - Keep format backward-compatible: missing fields assume `true` (tracking allowed) until user sees the dialog.
   - Snippet idea:
     ```ts
     type AnalyticsPrefs = { disableAnalytics?: boolean; consentVersion?: number };
     export const writePrefs = (prefs: AnalyticsPrefs) => fs.writeFileSync(path, JSON.stringify(prefs, null, 2));
     ```

3. [ ] **First-run consent dialog**
   - On renderer boot, check `analyticsGuard.shouldTrack()` and `consentVersion`.
   - If user has not responded, show modal: title “Help improve Kavim”, body describing anonymous analytics, privacy link.
   - Buttons:
     - "Allow analytics" → set `disableAnalytics=false`, `consentVersion=CURRENT_VERSION`, fire `trackPageView()`.
     - "No thanks" → set `disableAnalytics=true`, same consent version.
   - Auto-select "No thanks" for EU/UK locales (require explicit click on Allow). Else default highlight can be Allow but still wait for click.
   - Ensure modal only appears once per OS user unless policy version bumps.

4. [ ] **Settings toggle & privacy section**
   - Add a "Privacy & Analytics" panel (e.g., inside existing Settings modal or a new menu item) that exposes:
     - Current status (tracking enabled/disabled).
     - Toggle switch that updates `.kavim-analytics.json` via preload.
     - Text snippet: "Files stored at `~/.kavim-analytics.json`" and a link button opening the Privacy Policy in the default browser using `shell.openExternal()`.
   - Reuse the same helper so manual file edits and UI stay in sync.

5. [ ] **Respect Do Not Track**
   - Update the Umami `<script>` tag with `data-do-not-track="true"` so OS/browser DNT preferences automatically disable analytics.
   - In the renderer helper, short-circuit `trackPageView` if `navigator.doNotTrack === "1"`.

6. [ ] **Policy update hook**
   - Define `const ANALYTICS_POLICY_VERSION = 1`. When scope changes later, bump version; if stored `consentVersion` differs, re-show the dialog.
   - Add a tiny utility that checks version mismatch during app start and clears consent if needed.

## Risks & Considerations
- **Locale accuracy:** OS locale ≠ physical location. Our conservative rule (require opt-in when uncertain) prevents GDPR issues but may decrease data; acceptable trade-off.
- **Multiple OS users:** `.kavim-analytics.json` lives in the OS user’s home, so each person must set their own preference. Document this in the policy.
- **File permissions:** handle errors when reading/writing the JSON (e.g., locked file) and surface a toast if preferences cannot be saved.
- **No backend:** all consent state lives locally; if a user deletes the file, the dialog reappears (expected behavior).

I have generated the high-level tasks based on your description. Respond with "Go" to proceed, or request adjustments if the plan misses something.
