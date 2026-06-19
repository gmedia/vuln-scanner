import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const IpScanner = lazy(() => import("@/pages/IpScanner"));
const DomainScanner = lazy(() => import("@/pages/DomainScanner"));
const MobileScanner = lazy(() => import("@/pages/MobileScanner"));
const ScanDetail = lazy(() => import("@/pages/ScanDetail"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="scan/ip" element={<IpScanner />} />
          <Route path="scan/domain" element={<DomainScanner />} />
          <Route path="scan/mobile" element={<MobileScanner />} />
          <Route path="scan/:id" element={<ScanDetail />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default App;
