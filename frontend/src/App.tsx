import { lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AdminRoute from "@/components/auth/AdminRoute";
import { ErrorBoundaryFallback } from "@/components/ErrorBoundaryFallback";
import { PageBoundary } from "@/components/PageBoundary";
import { LandingLoading } from "@/components/LandingLoading";
import { AuthLoading } from "@/components/AuthLoading";
import { Toaster } from "@/components/ui/sonner";

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
const Schedules = lazy(() => import("@/pages/Schedules"));
const Assets = lazy(() => import("@/pages/Assets"));
const Guard = lazy(() => import("@/pages/Guard"));
const Siem = lazy(() => import("@/pages/Siem"));
const Uptime = lazy(() => import("@/pages/Uptime"));
const StatusPage = lazy(() => import("@/pages/StatusPage"));
const Profile = lazy(() => import("@/pages/Profile"));
const UserGuide = lazy(() => import("@/pages/UserGuide"));
const WorkspaceSettings = lazy(() => import("@/pages/WorkspaceSettings"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminUserDetail = lazy(() => import("@/pages/admin/AdminUserDetail"));
const AdminPricing = lazy(() => import("@/pages/admin/AdminPricing"));
const AdminHpp = lazy(() => import("@/pages/admin/AdminHpp"));
const AdminBlog = lazy(() => import("@/pages/admin/AdminBlog"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorBoundaryFallback}>
      <Toaster />
      <Routes>
        {/* Public routes — no AppShell wrapper */}
        <Route
          path="/"
          element={
            <PageBoundary component={Landing} fallback={<LandingLoading />} />
          }
        />
        <Route
          path="/login"
          element={
            <PageBoundary component={Login} fallback={<AuthLoading />} />
          }
        />
        <Route
          path="/register"
          element={
            <PageBoundary
              component={Register}
              fallback={<AuthLoading fields={3} />}
            />
          }
        />
        <Route
          path="/verify-email"
          element={
            <PageBoundary component={VerifyEmail} fallback={<AuthLoading />} />
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PageBoundary
              component={ForgotPassword}
              fallback={<AuthLoading />}
            />
          }
        />
        <Route
          path="/reset-password"
          element={
            <PageBoundary
              component={ResetPassword}
              fallback={<AuthLoading />}
            />
          }
        />

        {/* Protected routes — wrapped in AppShell */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route
              path="/dashboard"
              element={<PageBoundary component={Dashboard} />}
            />
            <Route
              path="/scan/ip"
              element={<PageBoundary component={IpScanner} />}
            />
            <Route
              path="/scan/domain"
              element={<PageBoundary component={DomainScanner} />}
            />
            <Route
              path="/scan/mobile"
              element={<PageBoundary component={MobileScanner} />}
            />
            <Route
              path="/scan/:id"
              element={<PageBoundary component={ScanDetail} />}
            />
            <Route
              path="/credit-history"
              element={<PageBoundary component={CreditHistory} />}
            />
            <Route
              path="/schedules"
              element={<PageBoundary component={Schedules} />}
            />
            <Route
              path="/assets"
              element={<PageBoundary component={Assets} />}
            />
            <Route path="/guard" element={<PageBoundary component={Guard} />} />
            <Route path="/siem" element={<PageBoundary component={Siem} />} />
            <Route
              path="/uptime"
              element={<PageBoundary component={Uptime} />}
            />
            <Route
              path="/uptime/status-page"
              element={<PageBoundary component={StatusPage} />}
            />
            <Route
              path="/profile"
              element={<PageBoundary component={Profile} />}
            />
            <Route
              path="/guide"
              element={<PageBoundary component={UserGuide} />}
            />
            <Route
              path="/settings/workspace"
              element={<PageBoundary component={WorkspaceSettings} />}
            />
            <Route
              path="/org/members"
              element={<PageBoundary component={WorkspaceSettings} />}
            />

            {/* Admin routes */}
            <Route element={<AdminRoute />}>
              <Route
                path="/admin"
                element={<PageBoundary component={AdminDashboard} />}
              />
              <Route
                path="/admin/users"
                element={<PageBoundary component={AdminUsers} />}
              />
              <Route
                path="/admin/users/:id"
                element={<PageBoundary component={AdminUserDetail} />}
              />
              <Route
                path="/admin/pricing"
                element={<PageBoundary component={AdminPricing} />}
              />
              <Route
                path="/admin/hpp"
                element={<PageBoundary component={AdminHpp} />}
              />
              <Route
                path="/admin/blog"
                element={<PageBoundary component={AdminBlog} />}
              />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<PageBoundary component={NotFound} />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
