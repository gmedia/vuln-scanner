import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Radar,
  Globe,
  Smartphone,
  Shield,
  Users,
  DollarSign,
  History,
  User,
  CalendarClock,
  BookOpen,
  Siren,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { useScanStore } from "@/store/scanStore";
import { useAuthStore } from "@/store/authStore";
import { Badge } from "@/components/ui/Badge";
import { BrandMark } from "@/components/brand/BrandMark";
import OrgSwitcher from "@/components/workspace/OrgSwitcher";
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
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/scan/ip", label: "IP Scanner", icon: Radar },
  { to: "/scan/domain", label: "Domain Scanner", icon: Globe },
  { to: "/scan/mobile", label: "Mobile Scanner", icon: Smartphone },
  { to: "/schedules", label: "Jadwal", icon: CalendarClock },
];

const productNav = [
  {
    to: "/guard",
    label: "Guard",
    hint: "Agen host",
    icon: Shield,
    testId: "nav-guard",
  },
  {
    to: "/siem",
    label: "SIEM",
    hint: "Event org",
    icon: Siren,
    testId: "nav-siem",
  },
  { to: "/guide", label: "User Guide", icon: BookOpen },
];

const accountNav = [
  { to: "/credit-history", label: "Credit History", icon: History },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings/workspace", label: "Workspace", icon: Users },
];

function pathActive(pathname: string, to: string, end?: boolean) {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavItem({
  to,
  label,
  icon: Icon,
  hint,
  testId,
  end,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  hint?: string;
  testId?: string;
  end?: boolean;
}) {
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
              <span className="text-[10px] font-normal text-muted-foreground">
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
          <SidebarGroupLabel>Scan</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {scanNav.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Attach</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {productNav.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
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
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem
                  to="/admin"
                  label="Admin overview"
                  icon={Shield}
                  end
                />
                <NavItem to="/admin/users" label="Users" icon={Users} />
                <NavItem
                  to="/admin/pricing"
                  label="Pricing"
                  icon={DollarSign}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        {activeJobId ? (
          <div className="rounded-md bg-muted p-3 group-data-[collapsible=icon]:hidden">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Active Scan
            </p>
            <p className="truncate font-mono text-xs text-foreground">
              {activeJobId.slice(0, 12)}...
            </p>
            <Badge variant="running" className="mt-2 text-[10px]">
              In Progress
            </Badge>
          </div>
        ) : null}
        <p className="px-2 text-center text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          {BRAND.sidebarVersion}
        </p>
      </SidebarFooter>
      <SidebarRail />
    </SidebarPrimitive>
  );
}

export default Sidebar;
