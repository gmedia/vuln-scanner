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
        <div className="flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default AppShell;
