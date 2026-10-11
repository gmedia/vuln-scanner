import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import BottomNav from "@/components/layout/BottomNav";
import Sidebar from "@/components/layout/Sidebar";

function AppShell() {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <Sidebar />
      <SidebarInset className="max-h-svh overflow-y-auto">
        <div className="flex items-center gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <SidebarTrigger>
            <Menu />
          </SidebarTrigger>
        </div>
        <div className="mx-auto w-full max-w-6xl flex-1 p-4 pb-[calc(4.5rem_+_env(safe-area-inset-bottom))] md:p-6 lg:p-8 2xl:max-w-[90rem]">
          <Outlet />
        </div>
      </SidebarInset>
      {isMobile ? <BottomNav /> : null}
    </SidebarProvider>
  );
}

export default AppShell;
