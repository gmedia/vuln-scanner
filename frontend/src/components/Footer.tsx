import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/brand/BrandMark";
import { BRAND } from "@/lib/brand";
import { useTranslation } from "react-i18next";

const colHead =
  "text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary";

const linkClass =
  "inline-flex min-h-11 items-center text-sm text-muted-foreground no-underline transition-colors hover:text-foreground";

export function Footer() {
  const { t } = useTranslation("landing");
  const { t: tc } = useTranslation("common");
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto shrink-0 border-t border-border bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 2xl:max-w-[90rem]">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div className="sm:col-span-2 lg:col-span-1">
            <BrandMark to="/" />
            <p className="mt-4 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
              {t("footerBlurb")}
            </p>
          </div>
          <div>
            <p className={colHead}>{t("footerProduct")}</p>
            <nav className="mt-3 flex flex-col" aria-label={t("footerProduct")}>
              <a href="/" className={linkClass}>
                {t("footerHome")}
              </a>
              <a href="/blog" className={linkClass}>
                {t("blog")}
              </a>
            </nav>
          </div>
          <div>
            <p className={colHead}>{t("footerLegal")}</p>
            <nav className="mt-3 flex flex-col" aria-label={t("footerLegal")}>
              <a href="/terms" className={linkClass}>
                {t("terms")}
              </a>
              <a href="/privacy" className={linkClass}>
                {t("privacy")}
              </a>
            </nav>
          </div>
          <div>
            <p className={colHead}>{t("footerAccount")}</p>
            <nav className="mt-3 flex flex-col items-start" aria-label={t("footerAccount")}>
              <Link to="/login" className={linkClass}>
                {tc("signIn")}
              </Link>
              <Button asChild size="sm" className="mt-1 min-h-11 px-3 text-xs font-semibold">
                <Link to="/register">{tc("getStarted")}</Link>
              </Button>
            </nav>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
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
