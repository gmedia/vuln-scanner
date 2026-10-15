import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { User, LogOut, ChevronDown } from "lucide-react";
import { useScanStore } from "@/store/scanStore";
import { useAuthStore } from "@/store/authStore";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
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
  collapsed?: boolean;
}

function Header({ children, collapsed = false }: HeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const activeJobId = useScanStore((s) => s.activeJobId);
  const scanType = useScanStore((s) => s.scanType);
  const progress = useScanStore((s) => s.progress);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);

  async function handleSignOut() {
    await logout();
    navigate("/login");
  }

  return (
    <header className={`flex min-w-0 flex-col gap-1.5 ${collapsed ? "px-0" : "px-1"}`}>
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

      <div className={collapsed ? "flex flex-col items-center gap-1" : "flex min-h-9 flex-wrap items-center gap-1.5 [&_button[aria-pressed=true]]:!bg-secondary [&_button[aria-pressed=true]]:!text-secondary-foreground"}>
        {collapsed && isAuthenticated ? <OrgSwitcher collapsed /> : null}
        <ThemeSwitcher collapsed={collapsed} className="h-9 min-h-9" />
        <LanguageSwitcher collapsed={collapsed} className="h-9 min-h-9" />
      </div>

      {!collapsed && isAuthenticated ? <OrgSwitcher className="w-full" /> : null}

      <div className="flex min-w-0 flex-wrap items-center gap-2 group-data-[collapsible=icon]:flex-col">
        {isAuthenticated && user ? (
          <DropdownMenu>
            {collapsed ? (
              <SidebarMenu>
                <SidebarMenuItem>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      type="button"
                      aria-label={user.email}
                      tooltip={user.email}
                      className="justify-center p-0"
                    >
                      <User aria-hidden />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                </SidebarMenuItem>
              </SidebarMenu>
            ) : (
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
            )}
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
