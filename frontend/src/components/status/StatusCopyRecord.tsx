import { Check, Copy } from "lucide-react";
import { SiemRail } from "@/components/siem/siemChrome";
import { Button } from "@/components/ui/Button";

export function StatusCopyRecord({
  label,
  display,
  testId,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: {
  readonly label: string;
  readonly display: string;
  readonly testId: string;
  readonly copied: boolean;
  readonly onCopy: () => void;
  readonly copyLabel: string;
  readonly copiedLabel: string;
}) {
  return (
    <div className="relative flex min-w-0 items-start gap-2 overflow-hidden rounded-lg border border-border bg-card px-3 py-2.5 pl-4">
      <SiemRail className="bg-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 break-all font-mono text-xs text-foreground">
          {display}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 w-11 shrink-0 p-0"
        data-testid={testId}
        onClick={onCopy}
        title={copied ? copiedLabel : copyLabel}
        aria-label={copied ? copiedLabel : copyLabel}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
