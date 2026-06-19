import type { ReactNode } from "react";
import { useScanStore } from "@/store/scanStore";
import { Badge } from "@/components/ui/Badge";
import { SCAN_TYPE_LABELS } from "@/lib/constants";

interface HeaderProps {
  children?: ReactNode;
}

function Header({ children }: HeaderProps) {
  const activeJobId = useScanStore((s) => s.activeJobId);
  const scanType = useScanStore((s) => s.scanType);
  const progress = useScanStore((s) => s.progress);

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card/50 px-4 backdrop-blur-sm">
      {children}
      <div className="flex flex-1 items-center justify-between">
        <h1 className="font-mono text-sm font-bold tracking-wider text-foreground">
          VULN<span className="text-primary">SCAN</span>
        </h1>

        {activeJobId && (
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              {scanType ? SCAN_TYPE_LABELS[scanType] ?? scanType : "Scan"}
            </span>
            <Badge variant="running" className="text-[10px]">
              {progress}%
            </Badge>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
