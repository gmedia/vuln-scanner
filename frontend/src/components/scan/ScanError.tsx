import { FileWarning } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ScanErrorProps {
  message: string;
  showIcon?: boolean;
}

export function ScanError({ message, showIcon }: ScanErrorProps) {
  return (
    <Alert variant="destructive" className="border-destructive/40">
      {showIcon ? <FileWarning /> : null}
      <AlertDescription className="text-xs">{message}</AlertDescription>
    </Alert>
  );
}
