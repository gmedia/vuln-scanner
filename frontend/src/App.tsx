import { Routes, Route } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Dashboard from "@/pages/Dashboard";
import IpScanner from "@/pages/IpScanner";
import DomainScanner from "@/pages/DomainScanner";
import MobileScanner from "@/pages/MobileScanner";
import ScanDetail from "@/pages/ScanDetail";
import NotFound from "@/pages/NotFound";

function App() {
  return (
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
  );
}

export default App;
