import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  htmlLang,
  isAppLocale,
  type AppLocale,
} from "./locales";
import enCommon from "@/locales/en/common.json";
import enAuth from "@/locales/en/auth.json";
import enLanding from "@/locales/en/landing.json";
import enNav from "@/locales/en/nav.json";
import idCommon from "@/locales/id/common.json";
import idAuth from "@/locales/id/auth.json";
import idLanding from "@/locales/id/landing.json";
import idNav from "@/locales/id/nav.json";

export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    landing: enLanding,
    nav: enNav,
  },
  id: {
    common: idCommon,
    auth: idAuth,
    landing: idLanding,
    nav: idNav,
  },
} as const;

export function readStoredLocale(): AppLocale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isAppLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function persistLocale(locale: AppLocale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    void 0;
  }
  document.documentElement.lang = htmlLang(locale);
}

export function resolveInitialLocale(): AppLocale {
  return readStoredLocale() ?? DEFAULT_LOCALE;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveInitialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: "common",
  ns: ["common", "auth", "landing", "nav"],
  interpolation: { escapeValue: false },
  returnNull: false,
});

if (typeof document !== "undefined") {
  document.documentElement.lang = htmlLang(
    isAppLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE,
  );
}

i18n.on("languageChanged", (lng) => {
  if (isAppLocale(lng)) persistLocale(lng);
});

export default i18n;
