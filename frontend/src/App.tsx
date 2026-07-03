import { lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AdminRoute from "@/components/auth/AdminRoute";
import { ErrorBoundaryFallback } from "@/components/ErrorBoundaryFallback";
import { PageBoundary } from "@/components/PageBoundary";

const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const IpScanner = lazy(() => import("@/pages/IpScanner"));
const DomainScanner = lazy(() => import("@/pages/DomainScanner"));
const MobileScanner = lazy(() => import("@/pages/MobileScanner"));
const ScanDetail = lazy(() => import("@/pages/ScanDetail"));
const CreditHistory = lazy(() => import("@/pages/credit/CreditHistory"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminUserDetail = lazy(() => import("@/pages/admin/AdminUserDetail"));
const AdminPricing = lazy(() => import("@/pages/admin/AdminPricing"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorBoundaryFallback}>
      <Routes>
        {/* Public routes — no AppShell wrapper */}
        <Route path="/" element={<PageBoundary><Landing /></PageBoundary>} />
        <Route path="/login" element={<PageBoundary><Login /></PageBoundary>} />
        <Route path="/register" element={<PageBoundary><Register /></PageBoundary>} />
        <Route path="/verify-email" element={<PageBoundary><VerifyEmail /></PageBoundary>} />

        {/* Protected routes — wrapped in AppShell */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<PageBoundary><Dashboard /></PageBoundary>} />
            <Route path="/scan/ip" element={<PageBoundary><IpScanner /></PageBoundary>} />
            <Route path="/scan/domain" element={<PageBoundary><DomainScanner /></PageBoundary>} />
            <Route path="/scan/mobile" element={<PageBoundary><MobileScanner /></PageBoundary>} />
            <Route path="/scan/:id" element={<PageBoundary><ScanDetail /></PageBoundary>} />
            <Route path="/credit-history" element={<PageBoundary><CreditHistory /></PageBoundary>} />

            {/* Admin routes */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<PageBoundary><AdminDashboard /></PageBoundary>} />
              <Route path="/admin/users" element={<PageBoundary><AdminUsers /></PageBoundary>} />
              <Route path="/admin/users/:id" element={<PageBoundary><AdminUserDetail /></PageBoundary>} />
              <Route path="/admin/pricing" element={<PageBoundary><AdminPricing /></PageBoundary>} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<PageBoundary><NotFound /></PageBoundary>} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
