import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isAppLocale, type AppLocale } from "@/i18n/locales";
import { patchMeLocale } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";

function LanguageSwitcher({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  const { i18n, t } = useTranslation("common");
  const current: AppLocale = isAppLocale(i18n.language) ? i18n.language : "id";

  if (collapsed) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                type="button"
                data-testid="language-switcher"
                aria-label={t("language")}
                tooltip={t("language")}
              >
                <Languages aria-hidden />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end">
              {(["id", "en"] as const).map((locale) => (
                <DropdownMenuItem
                  key={locale}
                  data-testid={`locale-${locale}`}
                  onSelect={() => {
                    void i18n.changeLanguage(locale);
                    if (useAuthStore.getState().isAuthenticated) {
                      void patchMeLocale(locale);
                    }
                  }}
                >
                  {locale === "id" ? t("languageId") : t("languageEn")}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex h-11 min-h-11 items-stretch overflow-hidden rounded-md border border-border text-[11px] font-medium leading-none",
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
            "h-full min-w-11 px-2.5",
            current === locale
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
