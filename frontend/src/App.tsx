import { lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AdminRoute from "@/components/auth/AdminRoute";
import { ErrorBoundaryFallback } from "@/components/ErrorBoundaryFallback";
import { PageBoundary } from "@/components/PageBoundary";

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorBoundaryFallback}>
      <Routes>
        {/* Public routes — no AppShell wrapper */}
        <Route path="/" element={<PageBoundary loader={() => import("@/pages/Landing")} />} />
        <Route path="/login" element={<PageBoundary loader={() => import("@/pages/Login")} />} />
        <Route path="/register" element={<PageBoundary loader={() => import("@/pages/Register")} />} />
        <Route path="/verify-email" element={<PageBoundary loader={() => import("@/pages/VerifyEmail")} />} />

        {/* Protected routes — wrapped in AppShell */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<PageBoundary loader={() => import("@/pages/Dashboard")} />} />
            <Route path="/scan/ip" element={<PageBoundary loader={() => import("@/pages/IpScanner")} />} />
            <Route path="/scan/domain" element={<PageBoundary loader={() => import("@/pages/DomainScanner")} />} />
            <Route path="/scan/mobile" element={<PageBoundary loader={() => import("@/pages/MobileScanner")} />} />
            <Route path="/scan/:id" element={<PageBoundary loader={() => import("@/pages/ScanDetail")} />} />
            <Route path="/credit-history" element={<PageBoundary loader={() => import("@/pages/credit/CreditHistory")} />} />

            {/* Admin routes */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<PageBoundary loader={() => import("@/pages/admin/AdminDashboard")} />} />
              <Route path="/admin/users" element={<PageBoundary loader={() => import("@/pages/admin/AdminUsers")} />} />
              <Route path="/admin/users/:id" element={<PageBoundary loader={() => import("@/pages/admin/AdminUserDetail")} />} />
              <Route path="/admin/pricing" element={<PageBoundary loader={() => import("@/pages/admin/AdminPricing")} />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<PageBoundary loader={() => import("@/pages/NotFound")} />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
