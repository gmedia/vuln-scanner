import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AdminRoute from "@/components/auth/AdminRoute";
import { ErrorBoundaryFallback } from "@/components/ErrorBoundaryFallback";

const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const IpScanner = lazy(() => import("@/pages/IpScanner"));
const DomainScanner = lazy(() => import("@/pages/DomainScanner"));
const MobileScanner = lazy(() => import("@/pages/MobileScanner"));
const ScanDetail = lazy(() => import("@/pages/ScanDetail"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminUserDetail = lazy(() => import("@/pages/admin/AdminUserDetail"));
const AdminPricing = lazy(() => import("@/pages/admin/AdminPricing"));
const CreditHistory = lazy(() => import("@/pages/credit/CreditHistory"));

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorBoundaryFallback}>
      <Suspense fallback={<div>Loading...</div>}>
        <Routes>
          {/* Public routes — no AppShell wrapper */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />

          {/* Protected routes — wrapped in AppShell */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/scan/ip" element={<IpScanner />} />
              <Route path="/scan/domain" element={<DomainScanner />} />
              <Route path="/scan/mobile" element={<MobileScanner />} />
              <Route path="/scan/:id" element={<ScanDetail />} />
              <Route path="/credit-history" element={<CreditHistory />} />

              {/* Admin routes */}
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/users/:id" element={<AdminUserDetail />} />
                <Route path="/admin/pricing" element={<AdminPricing />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
