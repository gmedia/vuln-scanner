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
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
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
        <Route path="/" element={<PageBoundary component={Landing} />} />
        <Route path="/login" element={<PageBoundary component={Login} />} />
        <Route path="/register" element={<PageBoundary component={Register} />} />
        <Route path="/verify-email" element={<PageBoundary component={VerifyEmail} />} />
        <Route path="/forgot-password" element={<PageBoundary component={ForgotPassword} />} />
        <Route path="/reset-password" element={<PageBoundary component={ResetPassword} />} />

        {/* Protected routes — wrapped in AppShell */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<PageBoundary component={Dashboard} />} />
            <Route path="/scan/ip" element={<PageBoundary component={IpScanner} />} />
            <Route path="/scan/domain" element={<PageBoundary component={DomainScanner} />} />
            <Route path="/scan/mobile" element={<PageBoundary component={MobileScanner} />} />
            <Route path="/scan/:id" element={<PageBoundary component={ScanDetail} />} />
            <Route path="/credit-history" element={<PageBoundary component={CreditHistory} />} />

            {/* Admin routes */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<PageBoundary component={AdminDashboard} />} />
              <Route path="/admin/users" element={<PageBoundary component={AdminUsers} />} />
              <Route path="/admin/users/:id" element={<PageBoundary component={AdminUserDetail} />} />
              <Route path="/admin/pricing" element={<PageBoundary component={AdminPricing} />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<PageBoundary component={NotFound} />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
