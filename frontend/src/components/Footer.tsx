import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { BRAND } from "@/lib/brand";
import { useTranslation } from "react-i18next";

const islandLinkClass =
  "inline-flex min-h-11 items-center justify-center px-2 text-sm text-foreground transition-colors hover:text-primary sm:justify-start sm:px-0";

export function Footer() {
  const { t } = useTranslation("landing");
  const { t: tc } = useTranslation("common");

  return (
    <footer className="mt-auto shrink-0 border-t border-border py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between 2xl:max-w-[90rem]">
        <p className="text-center text-xs text-muted-foreground sm:text-left">
          {BRAND.footerLine}
        </p>
        <nav className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-4">
          <a href="/blog" className={islandLinkClass}>
            {t("blog")}
          </a>
          <a href="/terms" className={islandLinkClass}>
            {t("terms")}
          </a>
          <a href="/privacy" className={islandLinkClass}>
            {t("privacy")}
          </a>
          <Link to="/login" className={islandLinkClass}>
            {tc("signIn")}
          </Link>
          <Button asChild size="sm" className="min-h-11 text-xs sm:w-auto">
            <Link to="/register">{tc("getStarted")}</Link>
          </Button>
        </nav>
      </div>
    </footer>
  );
}

export default Footer;
