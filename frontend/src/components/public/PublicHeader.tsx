import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BrandMark } from "@/components/brand/BrandMark";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";
import { useTranslation } from "react-i18next";

const navLinkClass =
  "inline-flex min-h-11 items-center text-xs text-muted-foreground transition-colors hover:text-foreground";

export function PublicHeader() {
  const { t } = useTranslation("products");
  const { t: tl } = useTranslation("landing");
  const { t: tc } = useTranslation("common");

  return (
    <header
      data-testid="public-header"
      className="border-b border-border pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto flex h-12 w-full max-w-6xl min-w-0 items-center justify-between gap-2 overflow-x-hidden px-4 2xl:max-w-[90rem]">
        <div className="shrink-0">
          <BrandMark to="/" />
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <Link
            to="/products"
            className={`hidden sm:inline-flex ${navLinkClass}`}
          >
            {t("nav.products")}
          </Link>
          <a href="/blog" className={`hidden sm:inline-flex ${navLinkClass}`}>
            {tl("blog")}
          </a>
          <div className="hidden sm:flex sm:items-center sm:gap-2">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
          <Link to="/login" className="hidden sm:inline">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 text-xs border-muted-foreground/50 text-foreground hover:border-foreground/40 hover:bg-accent"
            >
              {tc("signIn")}
            </Button>
          </Link>
          <Link to="/register" className="hidden sm:inline">
            <Button size="sm" className="min-h-11 text-xs">
              {tc("getStarted")}
            </Button>
          </Link>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 min-w-11 sm:hidden"
                aria-label={tc("menu", { defaultValue: "Menu" })}
              >
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-72 sm:max-w-sm"
              closeLabel={tc("close")}
            >
              <SheetHeader>
                <SheetTitle>{tc("menu", { defaultValue: "Menu" })}</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-3 px-4 pb-6">
                <Link
                  to="/products"
                  className="inline-flex min-h-11 items-center text-sm text-foreground"
                >
                  {t("nav.products")}
                </Link>
                <a
                  href="/blog"
                  className="inline-flex min-h-11 items-center text-sm text-foreground"
                >
                  {tl("blog")}
                </a>
                <ThemeSwitcher className="w-full" />
                <LanguageSwitcher className="w-full" />
                <Link to="/login">
                  <Button
                    variant="outline"
                    className="w-full min-h-11 border-muted-foreground/50 text-foreground"
                  >
                    {tc("signIn")}
                  </Button>
                </Link>
                <Link to="/register">
                  <Button className="w-full min-h-11">{tc("getStarted")}</Button>
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export default PublicHeader;
