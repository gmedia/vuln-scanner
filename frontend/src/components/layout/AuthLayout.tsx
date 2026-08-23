import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand/BrandMark";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";
import { useTranslation } from "react-i18next";

export const AUTH_SECONDARY_LINK =
  "inline-flex items-center justify-center py-2 text-sm text-foreground/90 hover:text-primary hover:underline";

interface AuthLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  maxWidth?: "sm" | "md" | "lg";
}

const maxWidthClass = {
  sm: "max-w-sm 2xl:max-w-md",
  md: "max-w-md 2xl:max-w-lg",
  lg: "max-w-xl 2xl:max-w-2xl",
} as const;

function AuthLayout({
  children,
  title,
  subtitle,
  maxWidth = "lg",
}: AuthLayoutProps) {
  const { t } = useTranslation("landing");
  return (
    <div className="relative flex min-h-dvh items-start justify-center bg-background px-4 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:items-center sm:py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute left-1/2 top-1/3 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-48 w-48 rounded-full bg-primary/5 blur-2xl" />
      </div>

      <div className={cn("relative z-10 w-full", maxWidthClass[maxWidth])}>
        <div className="mb-5 flex flex-col items-center gap-1.5 text-center sm:mb-6">
          <BrandMark to="/" aria-label={t("homeAria")} />
          <p className="hidden text-xs text-muted-foreground sm:block">
            {t("authSubtitle")}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </div>

        {(title || subtitle) && (
          <div className="mb-4 space-y-1 rounded-xl border border-border bg-card px-6 py-5 text-center shadow-sm">
            {title && (
              <h1 className="text-lg font-semibold tracking-wide text-foreground">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

export default AuthLayout;
export { AuthLayout };
