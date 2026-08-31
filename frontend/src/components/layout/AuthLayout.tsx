import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand/BrandMark";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";
import { useTranslation } from "react-i18next";

export const AUTH_SECONDARY_LINK =
  "inline-flex min-h-11 min-w-11 items-center justify-center px-2 py-2 text-sm text-foreground hover:text-primary hover:underline";

interface AuthLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  maxWidth?: "sm" | "md" | "lg";
}

const maxWidthClass = {
  sm: "max-w-xl 2xl:max-w-2xl",
  md: "max-w-2xl 2xl:max-w-3xl",
  lg: "max-w-3xl 2xl:max-w-4xl",
} as const;

function AuthLayout({
  children,
  title,
  subtitle,
  maxWidth = "lg",
}: AuthLayoutProps) {
  const { t } = useTranslation("landing");
  return (
    <div className="flex min-h-dvh items-start justify-center bg-background px-4 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:items-center sm:py-10">
      <div className={cn("w-full", maxWidthClass[maxWidth])}>
        <div className="mb-5 flex flex-col items-center gap-1.5 text-center sm:mb-6">
          <BrandMark to="/" aria-label={t("homeAria")} />
          <p className="hidden text-sm text-muted-foreground sm:block">
            {t("authSubtitle")}
          </p>
          <div
            className={cn(
              "mt-2 flex w-full flex-row flex-wrap items-center justify-center gap-2",
              "[&_button[aria-pressed=true]]:!bg-secondary [&_button[aria-pressed=true]]:!text-secondary-foreground",
            )}
          >
            <ThemeSwitcher className="h-11 min-h-11 w-auto" />
            <LanguageSwitcher className="h-11 min-h-11 w-auto" />
          </div>
        </div>

        {(title || subtitle) && (
          <div className="mb-4 space-y-1 px-1 text-center">
            {title && (
              <h1 className="text-xl font-semibold tracking-wide text-foreground 2xl:text-2xl">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-sm text-foreground/80">{subtitle}</p>
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
