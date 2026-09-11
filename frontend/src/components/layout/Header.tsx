import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, LogOut, ChevronDown, Coins } from "lucide-react";
import { useScanStore } from "@/store/scanStore";
import { useAuthStore } from "@/store/authStore";
import { useCreditStore } from "@/store/creditStore";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import OrgSwitcher from "@/components/workspace/OrgSwitcher";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";
import { SCAN_TYPE_LABELS } from "@/lib/constants";
import { useTranslation } from "react-i18next";

interface HeaderProps {
  children?: ReactNode;
}

function Header({ children }: HeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { t: tNav } = useTranslation("nav");

  const activeJobId = useScanStore((s) => s.activeJobId);
  const scanType = useScanStore((s) => s.scanType);
  const progress = useScanStore((s) => s.progress);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const credits = useCreditStore((s) => s.credits);
  const fetchBalance = useCreditStore((s) => s.fetchBalance);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchBalance();
    }
  }, [isAuthenticated, fetchBalance]);

  async function handleSignOut() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="flex min-w-0 flex-col gap-2 px-1">
      {children}
      {activeJobId ? (
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {scanType ? (SCAN_TYPE_LABELS[scanType] ?? scanType) : "Scan"}
          </span>
          <Badge variant="running" className="text-[10px]">
            {progress}%
          </Badge>
        </div>
      ) : null}

      <div className="flex min-h-11 flex-wrap items-center gap-2 [&_button[aria-pressed=true]]:!bg-secondary [&_button[aria-pressed=true]]:!text-secondary-foreground">
        <ThemeSwitcher />
        <LanguageSwitcher />
      </div>

      {isAuthenticated ? <OrgSwitcher className="w-full" /> : null}

      <div className="flex min-w-0 flex-wrap items-center gap-2 group-data-[collapsible=icon]:flex-col">
        {isAuthenticated ? (
          <Button
            variant="outline"
            size="sm"
            className="h-11 min-h-11 gap-1.5 bg-muted/40 px-2.5 text-xs text-foreground hover:text-primary"
            asChild
          >
            <Link to="/credit-history" title={tNav("creditsTitle")}>
              <Coins className="h-3.5 w-3.5 text-primary" aria-hidden />
              <span className="hidden text-muted-foreground group-data-[collapsible=icon]:hidden sm:inline">
                {t("scanCredits")}
              </span>
              <span
                className="font-mono font-bold text-primary tabular-nums"
                data-testid="header-credits"
              >
                {credits.toLocaleString()}
              </span>
            </Link>
          </Button>
        ) : null}

        {isAuthenticated && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-11 min-h-11 gap-2 px-2 text-sm text-muted-foreground"
              >
                <User className="h-4 w-4" />
                <span className="hidden max-w-[10rem] truncate text-xs group-data-[collapsible=icon]:hidden sm:inline">
                  {user.email}
                </span>
                <ChevronDown className="h-3 w-3 group-data-[collapsible=icon]:hidden" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              data-testid="user-menu"
            >
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t("signedInAs")}{" "}
                <span className="text-foreground">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                data-testid="sign-out"
                onSelect={() => {
                  void handleSignOut();
                }}
              >
                <LogOut className="h-3 w-3" />
                {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );
}

export default Header;
