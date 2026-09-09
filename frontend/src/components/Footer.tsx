import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { BRAND } from "@/lib/brand";
import { useTranslation } from "react-i18next";

const islandLinkClass =
  "inline-flex min-h-11 items-center px-[0.35rem] text-xs text-muted-foreground no-underline transition-colors hover:text-foreground";

export function Footer() {
  const { t } = useTranslation("landing");
  const { t: tc } = useTranslation("common");

  return (
    <footer className="mt-auto shrink-0 border-t border-border py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 2xl:max-w-[90rem]">
        <p className="m-0 text-xs text-muted-foreground">{BRAND.footerLine}</p>
        <nav className="flex flex-wrap items-center">
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
          <Button asChild size="sm" className="min-h-11 px-3 text-xs font-semibold">
            <Link to="/register">{tc("getStarted")}</Link>
          </Button>
        </nav>
      </div>
    </footer>
  );
}

export default Footer;
