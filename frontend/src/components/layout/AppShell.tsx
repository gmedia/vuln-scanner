import { Outlet } from "react-router-dom";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

function AppShell() {
  return (
    <SidebarProvider>
      <Sidebar />
      <SidebarInset className="max-h-svh overflow-y-auto">
        <Header>
          <SidebarTrigger />
        </Header>
        <div className="mx-auto w-full max-w-[90rem] flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6 lg:p-8 2xl:max-w-[140rem]">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default AppShell;
