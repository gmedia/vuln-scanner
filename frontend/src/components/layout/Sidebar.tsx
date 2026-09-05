import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Radar,
  Globe,
  Smartphone,
  Shield,
  Users,
  DollarSign,
  Calculator,
  History,
  User,
  CalendarClock,
  BookOpen,
  Siren,
  Server,
  Activity,
  FileText,
  FolderLock,
  Mail,
  Bot,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { useTranslation } from "react-i18next";
import { useScanStore } from "@/store/scanStore";
import { useAuthStore } from "@/store/authStore";
import { Badge } from "@/components/ui/Badge";
import { BrandMark } from "@/components/brand/BrandMark";
import OrgSwitcher from "@/components/workspace/OrgSwitcher";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const scanNav = [
  { to: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, end: true },
  { to: "/scan/ip", labelKey: "ipScanner", icon: Radar },
  { to: "/scan/domain", labelKey: "domainScanner", icon: Globe },
  { to: "/scan/mobile", labelKey: "mobileScanner", icon: Smartphone },
  { to: "/schedules", labelKey: "schedules", icon: CalendarClock },
  { to: "/assets", labelKey: "assets", icon: Server, testId: "nav-assets" },
];

const productNav = [
  {
    to: "/guard",
    labelKey: "guard",
    hintKey: "guardHint",
    icon: Shield,
    testId: "nav-guard",
  },
  {
    to: "/siem",
    labelKey: "siem",
    hintKey: "siemHint",
    icon: Siren,
    testId: "nav-siem",
  },
  {
    to: "/ai",
    labelKey: "ai",
    hintKey: "aiHint",
    icon: Bot,
    testId: "nav-ai",
  },
  {
    to: "/host",
    labelKey: "hostProtect",
    hintKey: "hostProtectHint",
    icon: FolderLock,
    testId: "nav-host",
  },
  {
    to: "/uptime",
    labelKey: "uptime",
    hintKey: "uptimeHint",
    icon: Activity,
    testId: "nav-uptime",
    end: true,
  },
  {
    to: "/uptime/status-page",
    labelKey: "statusPage",
    hintKey: "statusPageHint",
    icon: FileText,
    testId: "nav-status-page",
  },
  { to: "/guide", labelKey: "guide", icon: BookOpen },
];

const accountNav = [
  { to: "/credit-history", labelKey: "creditHistory", icon: History },
  { to: "/profile", labelKey: "profile", icon: User },
  { to: "/settings/workspace", labelKey: "workspace", icon: Users },
];

function pathActive(pathname: string, to: string, end?: boolean) {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavItem({
  to,
  labelKey,
  icon: Icon,
  hintKey,
  testId,
  end,
}: {
  to: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  hintKey?: string;
  testId?: string;
  end?: boolean;
}) {
  const { t } = useTranslation("nav");
  const label = t(labelKey);
  const hint = hintKey ? t(hintKey) : undefined;
  const { setOpenMobile } = useSidebar();
  const pathname = useLocation().pathname;
  const isActive = pathActive(pathname, to, end);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <NavLink
          to={to}
          end={end}
          onClick={() => setOpenMobile(false)}
          data-testid={testId}
        >
          <Icon />
          <span className="flex min-w-0 flex-col leading-tight">
            <span>{label}</span>
            {hint ? (
              <span className="truncate text-[10px] font-normal text-sidebar-foreground/80">
                {hint}
              </span>
            ) : null}
          </span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function Sidebar() {
  const { t } = useTranslation("nav");
  const activeJobId = useScanStore((s) => s.activeJobId);
  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false);
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarPrimitive collapsible="icon" role="complementary">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <BrandMark to="/" onClick={() => setOpenMobile(false)} />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-2 sm:hidden">
          <OrgSwitcher className="w-full" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("groupScan")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {scanNav.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t("groupAttach")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {productNav.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t("groupAccount")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountNav.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel>{t("groupAdmin")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem
                  to="/admin"
                  labelKey="adminOverview"
                  icon={Shield}
                  end
                />
                <NavItem to="/admin/users" labelKey="users" icon={Users} />
                <NavItem
                  to="/admin/pricing"
                  labelKey="pricing"
                  icon={DollarSign}
                />
                <NavItem
                  to="/admin/hpp"
                  labelKey="hpp"
                  icon={Calculator}
                  testId="nav-admin-hpp"
                />
                <NavItem
                  to="/admin/blog"
                  labelKey="blog"
                  icon={FileText}
                  testId="nav-admin-blog"
                />
                <NavItem
                  to="/admin/email-logs"
                  labelKey="emailLogs"
                  icon={Mail}
                  testId="nav-admin-email-logs"
                />
                <NavItem
                  to="/admin/ai"
                  labelKey="adminAi"
                  icon={Bot}
                  testId="nav-admin-ai"
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex min-h-11 flex-wrap items-center gap-2 px-2 pb-1 md:hidden [&_button[aria-pressed=true]]:!bg-secondary [&_button[aria-pressed=true]]:!text-secondary-foreground">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
        {activeJobId ? (
          <div className="rounded-md bg-muted p-3 group-data-[collapsible=icon]:hidden">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("activeScan")}
            </p>
            <p className="truncate font-mono text-xs text-foreground">
              {activeJobId.slice(0, 12)}...
            </p>
            <Badge variant="running" className="mt-2 text-[10px]">
              {t("inProgress")}
            </Badge>
          </div>
        ) : null}
        <p className="px-2 text-center text-[10px] text-foreground/70 group-data-[collapsible=icon]:hidden">
          {BRAND.sidebarVersion}
        </p>
      </SidebarFooter>
      <SidebarRail />
    </SidebarPrimitive>
  );
}

export default Sidebar;
