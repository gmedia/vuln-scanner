import { Outlet } from "react-router-dom";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import Sidebar from "@/components/layout/Sidebar";

function AppShell() {
  return (
    <SidebarProvider>
      <Sidebar />
      <SidebarInset className="max-h-svh overflow-y-auto">
        <SidebarTrigger className="fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 md:hidden" />
        <div className="mx-auto w-full max-w-6xl flex-1 p-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] md:p-6 lg:p-8 2xl:max-w-[90rem]">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default AppShell;
