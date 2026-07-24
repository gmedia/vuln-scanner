import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, LogOut, ChevronDown, Coins } from "lucide-react";
import { useScanStore } from "@/store/scanStore";
import { useAuthStore } from "@/store/authStore";
import { useCreditStore } from "@/store/creditStore";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SCAN_TYPE_LABELS } from "@/lib/constants";

interface HeaderProps {
  children?: ReactNode;
}

function Header({ children }: HeaderProps) {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    setDropdownOpen(false);
    await logout();
    navigate("/login");
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card/50 px-4 backdrop-blur-xs">
      {children}
      <div className="flex flex-1 items-center justify-between gap-3">
        <h1 className="font-mono text-sm font-bold tracking-wider text-foreground lg:sr-only">
          VULN<span className="text-primary">SCAN</span>
        </h1>

        {activeJobId && (
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              {scanType ? SCAN_TYPE_LABELS[scanType] ?? scanType : "Scan"}
            </span>
            <Badge variant="running" className="text-[10px]">
              {progress}%
            </Badge>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {isAuthenticated && (
          <Link
            to="/credit-history"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-xs text-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Credit balance"
          >
            <Coins className="h-3.5 w-3.5 text-primary" aria-hidden />
            <span className="text-muted-foreground hidden sm:inline">Credits</span>
            <span className="font-bold text-primary tabular-nums" data-testid="header-credits">
              {credits}
            </span>
          </Link>
        )}

        {isAuthenticated && user && (
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <User className="h-4 w-4" />
              <span className="hidden font-mono text-xs sm:inline">{user.email}</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            {dropdownOpen && (
              <div
                data-testid="user-menu"
                className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-card p-1 shadow-lg"
              >
                <div className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  Signed in as <span className="text-foreground">{user.email}</span>
                </div>
                <Button
                  variant="ghost"
                  data-testid="sign-out"
                  onClick={handleSignOut}
                  className="w-full justify-start px-3 py-2 font-mono text-xs text-red-400 hover:bg-red-400/10"
                >
                  <LogOut className="mr-2 h-3 w-3" />
                  Sign Out
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
