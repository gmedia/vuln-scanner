import { Badge } from "@/components/ui/Badge";
import { severityBadgeVariant, severityLabelKey } from "@/lib/siemSeverity";
import { cn } from "@/lib/utils";
import { TONE_CHIP_TEXT } from "@/lib/toneColors";

type Translate = (key: string) => string;

export function LevelChip({
  level,
  t,
}: {
  readonly level: number;
  readonly t: Translate;
}) {
  return (
    <Badge variant={severityBadgeVariant(level)}>
      L{level} · {t(severityLabelKey(level))}
    </Badge>
  );
}

export function CaseStatusBadge({
  status,
  t,
}: {
  readonly status: string;
  readonly t: Translate;
}) {
  if (status === "open") {
    return (
      <Badge className={`bg-sky-500/15 ${TONE_CHIP_TEXT.sky}`}>
        {t("statusOpen")}
      </Badge>
    );
  }
  if (status === "ack") {
    return (
      <Badge className={`bg-amber-500/15 ${TONE_CHIP_TEXT.amber}`}>
        {t("statusAck")}
      </Badge>
    );
  }
  if (status === "closed") {
    return (
      <Badge className={`bg-emerald-500/15 ${TONE_CHIP_TEXT.emerald}`}>
        {t("statusClosed")}
      </Badge>
    );
  }
  return <Badge variant="info">{status}</Badge>;
}

export function SiemRail({ className }: { readonly className: string }) {
  return (
    <span
      className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", className)}
      aria-hidden
    />
  );
}
