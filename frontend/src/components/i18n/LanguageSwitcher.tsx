import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { isAppLocale, type AppLocale } from "@/i18n/locales";
import { patchMeLocale } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";

function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation("common");
  const current: AppLocale = isAppLocale(i18n.language) ? i18n.language : "id";

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border text-[11px] font-medium",
        className,
      )}
      role="group"
      aria-label={t("language")}
      data-testid="language-switcher"
    >
      {(["id", "en"] as const).map((locale) => (
        <button
          key={locale}
          type="button"
          data-testid={`locale-${locale}`}
          aria-pressed={current === locale}
          className={cn(
            "px-2 py-1 min-h-8",
            current === locale
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => {
            void i18n.changeLanguage(locale);
            if (useAuthStore.getState().isAuthenticated) {
              void patchMeLocale(locale);
            }
          }}
        >
          {locale === "id" ? t("languageId") : t("languageEn")}
        </button>
      ))}
    </div>
  );
}

export default LanguageSwitcher;
