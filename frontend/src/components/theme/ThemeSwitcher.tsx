import { useCallback, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  persistTheme,
  resolveTheme,
  subscribeTheme,
  type AppTheme,
} from "@/theme/theme";

function ThemeSwitcher({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
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

  if (collapsed) {
    const target = current === "dark" ? "light" : "dark";
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            type="button"
            data-testid="theme-switcher"
            aria-label={t(target === "dark" ? "themeDark" : "themeLight")}
            tooltip={t(target === "dark" ? "themeDark" : "themeLight")}
            onClick={() => setTheme(target)}
          >
            {target === "light" ? <Sun aria-hidden /> : <Moon aria-hidden />}
          </SidebarMenuButton>
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
            "h-full min-w-11 px-2.5",
            current === theme
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
