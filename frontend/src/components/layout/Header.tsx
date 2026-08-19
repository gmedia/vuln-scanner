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
import { BrandMark } from "@/components/brand/BrandMark";
import OrgSwitcher from "@/components/workspace/OrgSwitcher";
import { SCAN_TYPE_LABELS } from "@/lib/constants";

interface HeaderProps {
  children?: ReactNode;
}

function Header({ children }: HeaderProps) {
  const navigate = useNavigate();

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
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card/50 px-4 backdrop-blur-xs">
      {children}
      <div className="flex flex-1 items-center justify-between gap-3">
        <h1 className="lg:sr-only">
          <BrandMark
            to={false}
            className="font-mono text-sm font-bold tracking-wider text-foreground"
          />
        </h1>

        {activeJobId && (
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {scanType ? (SCAN_TYPE_LABELS[scanType] ?? scanType) : "Scan"}
            </span>
            <Badge variant="running" className="text-[10px]">
              {progress}%
            </Badge>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {isAuthenticated && <OrgSwitcher className="hidden sm:block" />}

        {isAuthenticated && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 bg-muted/40 px-2.5 text-xs text-foreground hover:text-primary"
            asChild
          >
            <Link to="/credit-history" title="Saldo kredit pribadi">
              <Coins className="h-3.5 w-3.5 text-primary" aria-hidden />
              <span className="hidden text-muted-foreground sm:inline">
                Kredit
              </span>
              <span
                className="font-mono font-bold text-primary tabular-nums"
                data-testid="header-credits"
              >
                {credits}
              </span>
            </Link>
          </Button>
        )}

        {isAuthenticated && user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-9 gap-2 px-2 text-sm text-muted-foreground"
              >
                <User className="h-4 w-4" />
                <span className="hidden text-xs sm:inline">{user.email}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              data-testid="user-menu"
            >
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Signed in as{" "}
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
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}

export default Header;
