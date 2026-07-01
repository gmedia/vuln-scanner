import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

function AdminRoute() {
  const user = useAuthStore((s) => s.user);

  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default AdminRoute;
