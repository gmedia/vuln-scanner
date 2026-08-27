import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { captureInviteFromSearch } from "@/lib/inviteToken";

function ProtectedRoute() {
  const { isLoading, isAuthenticated, initialize } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const token = captureInviteFromSearch(location.search);
    const to = token ? `/login?invite=${encodeURIComponent(token)}` : "/login";
    return <Navigate to={to} replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
