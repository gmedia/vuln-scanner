import { FileWarning } from "lucide-react";

interface ScanErrorProps {
  message: string;
  showIcon?: boolean;
}

export function ScanError({ message, showIcon }: ScanErrorProps) {
  if (showIcon) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2">
        <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <p className="font-mono text-xs text-red-400">{message}</p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2">
      <p className="font-mono text-xs text-red-400">{message}</p>
    </div>
  );
}
