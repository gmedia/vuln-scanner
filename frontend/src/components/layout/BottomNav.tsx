import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  LayoutDashboard,
  Radar,
  Server,
  Shield,
} from "lucide-react";
import { useFeatureStatus } from "@/hooks/use-feature-status";
import { cn } from "@/lib/utils";

type BottomNavItem = {
  key: string;
  to: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  testId: string;
  isActive: boolean;
};

function BottomNav() {
  const { t } = useTranslation("nav");
  const { pathname } = useLocation();
  const { guard, uptime } = useFeatureStatus();

  const items: BottomNavItem[] = [
    {
      key: "dashboard",
      to: "/dashboard",
      labelKey: "dashboard",
      icon: LayoutDashboard,
      testId: "bottom-nav-dashboard",
      isActive: pathname === "/dashboard",
    },
    {
      key: "scan",
      to: "/scan/ip",
      labelKey: "scan",
      icon: Radar,
      testId: "bottom-nav-scan",
      isActive: pathname.startsWith("/scan"),
    },
    {
      key: "assets",
      to: "/assets",
      labelKey: "assets",
      icon: Server,
      testId: "bottom-nav-assets",
      isActive: pathname === "/assets" || pathname.startsWith("/assets/"),
    },
  ];

  if (guard) {
    items.push({
      key: "guard",
      to: "/guard",
      labelKey: "guard",
      icon: Shield,
      testId: "bottom-nav-guard",
      isActive: pathname === "/guard" || pathname.startsWith("/guard/"),
    });
  }

  if (uptime) {
    items.push({
      key: "uptime",
      to: "/uptime",
      labelKey: "uptime",
      icon: Activity,
      testId: "bottom-nav-uptime",
      isActive: pathname.startsWith("/uptime"),
    });
  }

  return (
    <nav
      aria-label={t("bottomNavLabel")}
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <div className="mx-auto flex w-full max-w-6xl items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              to={item.to}
              data-testid={item.testId}
              aria-current={item.isActive ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors",
                item.isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="max-w-full truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default BottomNav;
