export const LOCALES = ["id", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "id";
export const LOCALE_STORAGE_KEY = "sinexis.locale";

export function isAppLocale(
  value: string | null | undefined,
): value is AppLocale {
  return value === "id" || value === "en";
}

export function htmlLang(locale: AppLocale): string {
  return locale === "id" ? "id" : "en";
}
