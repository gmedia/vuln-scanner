import { FileWarning } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ScanErrorProps {
  message: string;
  errorKey?: string;
  showIcon?: boolean;
}

export function ScanError({ message, errorKey, showIcon }: ScanErrorProps) {
  return (
    <Alert data-testid="scan-error" data-error-key={errorKey} variant="destructive" className="border-destructive/40">
      {showIcon ? <FileWarning /> : null}
      <AlertDescription className="text-xs">{message}</AlertDescription>
    </Alert>
  );
}
