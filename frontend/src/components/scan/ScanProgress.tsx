import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { useScanStore } from "@/store/scanStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useScanDetail } from "@/hooks/useScan";
import { Progress } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface ScanProgressProps {
  className?: string;
}

function ScanProgress({ className }: ScanProgressProps) {
  const navigate = useNavigate();
  const activeJobId = useScanStore((s) => s.activeJobId);
  const progress = useScanStore((s) => s.progress);
  const status = useScanStore((s) => s.status);
  const setProgress = useScanStore((s) => s.setProgress);
  const clearActiveScan = useScanStore((s) => s.clearActiveScan);

  const { data: scanData } = useScanDetail(activeJobId);

  const handleProgress = useCallback(
    (msg: { step: string; progress: number; message: string }) => {
      setProgress(msg.progress, msg.step || "running");
    },
    [setProgress],
  );

  useWebSocket(activeJobId, handleProgress);

  useEffect(() => {
    if (scanData?.status === "completed" || scanData?.status === "failed") {
      setProgress(100, scanData.status);
      if (scanData.status === "completed" && activeJobId) {
        const timer = setTimeout(() => {
          navigate(`/scan/${activeJobId}`);
          clearActiveScan();
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [scanData?.status, scanData?.id, activeJobId, navigate, clearActiveScan, setProgress]);

  const isComplete = status === "completed" || progress >= 100;
  const isFailed = status === "failed";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 className="h-5 w-5 text-primary" />
          ) : isFailed ? (
            <XCircle className="h-5 w-5 text-destructive" />
          ) : (
            <Clock className="h-5 w-5 animate-pulse text-blue-400" />
          )}
          <span className="font-mono text-sm font-medium text-foreground">
            {isComplete ? "SCAN COMPLETE" : isFailed ? "SCAN FAILED" : "SCANNING TARGET"}
          </span>
        </div>
        <Badge
          variant={isComplete ? "completed" : isFailed ? "failed" : "running"}
          className="font-mono text-[10px]"
        >
          {progress}%
        </Badge>
      </div>

      <Progress
        value={progress}
        indicatorClassName={cn(
          isFailed
            ? "bg-destructive"
            : "bg-gradient-to-r from-primary/70 via-primary to-emerald-300",
        )}
        className="h-2.5"
      />

      {activeJobId && (
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          ID: {activeJobId}
        </p>
      )}
    </div>
  );
}

export default ScanProgress;
