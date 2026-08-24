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
import enScan from "@/locales/en/scan.json";
import enSchedules from "@/locales/en/schedules.json";
import enWorkspace from "@/locales/en/workspace.json";
import enGuard from "@/locales/en/guard.json";
import enGuide from "@/locales/en/guide.json";
import enSiem from "@/locales/en/siem.json";
import enAssets from "@/locales/en/assets.json";
import enAdmin from "@/locales/en/admin.json";
import idCommon from "@/locales/id/common.json";
import idAuth from "@/locales/id/auth.json";
import idLanding from "@/locales/id/landing.json";
import idNav from "@/locales/id/nav.json";
import idScan from "@/locales/id/scan.json";
import idSchedules from "@/locales/id/schedules.json";
import idWorkspace from "@/locales/id/workspace.json";
import idGuard from "@/locales/id/guard.json";
import idGuide from "@/locales/id/guide.json";
import idSiem from "@/locales/id/siem.json";
import idAssets from "@/locales/id/assets.json";
import idAdmin from "@/locales/id/admin.json";

export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    landing: enLanding,
    nav: enNav,
    scan: enScan,
    schedules: enSchedules,
    workspace: enWorkspace,
    guard: enGuard,
    guide: enGuide,
    siem: enSiem,
    assets: enAssets,
    admin: enAdmin,
  },
  id: {
    common: idCommon,
    auth: idAuth,
    landing: idLanding,
    nav: idNav,
    scan: idScan,
    schedules: idSchedules,
    workspace: idWorkspace,
    guard: idGuard,
    guide: idGuide,
    siem: idSiem,
    assets: idAssets,
    admin: idAdmin,
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
  ns: [
    "common",
    "auth",
    "landing",
    "nav",
    "scan",
    "schedules",
    "workspace",
    "guard",
    "guide",
    "siem",
    "assets",
    "admin",
  ],
  interpolation: { escapeValue: false },
  returnNull: false,
  compatibilityJSON: "v4",
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
