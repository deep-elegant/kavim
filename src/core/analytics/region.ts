const EU_AND_UK_COUNTRIES = new Set([
  "at",
  "be",
  "bg",
  "hr",
  "cy",
  "cz",
  "dk",
  "ee",
  "fi",
  "fr",
  "de",
  "gr",
  "hu",
  "ie",
  "it",
  "lv",
  "lt",
  "lu",
  "mt",
  "nl",
  "pl",
  "pt",
  "ro",
  "sk",
  "si",
  "es",
  "se",
  "uk",
  "gb",
  "is",
  "li",
  "no",
  "ch",
]);

const extractRegionCode = (locale?: string) => {
  if (!locale) {
    return null;
  }

  const normalized = locale.toLowerCase().replace(/_/g, "-");
  const segments = normalized.split("-");

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment.length === 2) {
      return segment;
    }
  }

  return null;
};

export const requiresExplicitOptInForLocale = (locale?: string) => {
  const regionCode = extractRegionCode(locale);
  if (!regionCode) {
    return true;
  }

  return EU_AND_UK_COUNTRIES.has(regionCode);
};
