import { useCallback, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  persistTheme,
  resolveTheme,
  subscribeTheme,
  type AppTheme,
} from "@/theme/theme";

function ThemeSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation("common");
  const current = useSyncExternalStore(
    subscribeTheme,
    resolveTheme,
    () => "dark" as const,
  );

  const setTheme = useCallback((theme: AppTheme) => {
    persistTheme(theme);
    applyTheme(theme);
  }, []);

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border text-[11px] font-medium",
        className,
      )}
      role="group"
      aria-label={t("appearance")}
      data-testid="theme-switcher"
    >
      {(["dark", "light"] as const).map((theme) => (
        <button
          key={theme}
          type="button"
          data-testid={`theme-${theme}`}
          aria-pressed={current === theme}
          className={cn(
            "px-2 py-1 min-h-8",
            current === theme
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => {
            setTheme(theme);
          }}
        >
          {theme === "dark" ? t("themeDark") : t("themeLight")}
        </button>
      ))}
    </div>
  );
}

export default ThemeSwitcher;
