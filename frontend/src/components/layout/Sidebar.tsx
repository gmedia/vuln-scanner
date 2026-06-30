import { Link, NavLink } from "react-router-dom";
import { X, LayoutDashboard, Radar, Globe, Smartphone, Crosshair, Shield, Users, DollarSign, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScanStore } from "@/store/scanStore";
import { useAuthStore } from "@/store/authStore";
import { Separator } from "@/components/ui/Separator";
import { Badge } from "@/components/ui/Badge";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scan/ip", label: "IP Scanner", icon: Radar },
  { to: "/scan/domain", label: "Domain Scanner", icon: Globe },
  { to: "/scan/mobile", label: "Mobile Scanner", icon: Smartphone },
];

function Sidebar({ open, onClose }: SidebarProps) {
  const activeJobId = useScanStore((s) => s.activeJobId);
  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform duration-300 lg:static lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <Link to="/" className="flex items-center gap-2.5" onClick={onClose}>
          <Crosshair className="h-5 w-5 text-primary" />
          <span className="font-mono text-sm font-bold tracking-wider text-foreground">
            VULN<span className="text-primary">SCAN</span>
          </span>
        </Link>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/dashboard"}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary [&>svg]:text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}

        <NavLink
          to="/credit-history"
          onClick={onClose}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-primary/10 text-primary [&>svg]:text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )
          }
        >
          <History className="h-4 w-4 shrink-0" />
          Credit History
        </NavLink>

        {isAdmin && (
          <>
            <Separator className="my-2" />
            <p className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Admin
            </p>
            <NavLink
              to="/admin"
              end
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary [&>svg]:text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <Shield className="h-4 w-4 shrink-0" />
              Dashboard
            </NavLink>
            <NavLink
              to="/admin/users"
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary [&>svg]:text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <Users className="h-4 w-4 shrink-0" />
              Users
            </NavLink>
            <NavLink
              to="/admin/pricing"
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary [&>svg]:text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <DollarSign className="h-4 w-4 shrink-0" />
              Pricing
            </NavLink>
          </>
        )}
      </nav>

      {activeJobId && (
        <>
          <Separator />
          <div className="p-3">
            <div className="rounded-md bg-muted p-3">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Active Scan
              </p>
              <p className="font-mono text-xs text-foreground truncate">
                {activeJobId.slice(0, 12)}...
              </p>
              <Badge variant="running" className="mt-2 text-[10px]">
                In Progress
              </Badge>
            </div>
          </div>
        </>
      )}

      <div className="border-t border-border p-3">
        <p className="text-center font-mono text-[10px] text-muted-foreground">
          VulnScanner v0.1.0
        </p>
      </div>
    </aside>
  );
}

export default Sidebar;
