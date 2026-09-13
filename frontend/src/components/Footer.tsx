import { Link } from "react-router-dom";
import { BrandMark } from "@/components/brand/BrandMark";
import { BRAND } from "@/lib/brand";
import { useTranslation } from "react-i18next";

const linkClass =
  "inline-flex min-h-11 items-center rounded-sm text-sm text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const ctaClass =
  "inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-primary no-underline underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function Footer() {
  const { t } = useTranslation("landing");
  const { t: tc } = useTranslation("common");
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto shrink-0 border-t border-border bg-gradient-to-b from-muted/40 to-background">
      <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10 2xl:max-w-[90rem]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <div className="max-w-sm">
            <BrandMark to="/" />
            <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
              {t("footerBlurb")}
            </p>
          </div>
          <nav
            className="flex flex-wrap items-center gap-x-4 lg:max-w-md lg:justify-end lg:gap-x-5"
            aria-label={t("footerNav")}
          >
            <a href="/" className={linkClass}>
              {t("footerHome")}
            </a>
            <a href="/blog" className={linkClass}>
              {t("blog")}
            </a>
            <a href="/terms" className={linkClass}>
              {t("terms")}
            </a>
            <a href="/privacy" className={linkClass}>
              {t("privacy")}
            </a>
            <Link to="/login" className={linkClass}>
              {tc("signIn")}
            </Link>
            <Link to="/register" className={ctaClass}>
              {tc("getStarted")}
            </Link>
          </nav>
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-xs text-muted-foreground">{BRAND.footerLine}</p>
          <p className="m-0 text-xs text-muted-foreground">
            © {year} {BRAND.name}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
