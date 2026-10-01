import { Copy } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  truncateId,
  type GuardTranslate,
} from "@/components/guard/guardFormat";

export function GuardPulse() {
  return (
    <span className="relative ml-2 inline-flex h-2 w-2" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
  );
}

export function CopyableId({
  value,
  label,
}: {
  readonly value: string;
  readonly label: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span
        className="max-w-[12rem] truncate font-mono text-[11px] text-muted-foreground"
        title={truncateId(value)}
      >
        {truncateId(value)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 min-h-8 min-w-8 shrink-0"
        aria-label={label}
        onClick={() => {
          void navigator.clipboard?.writeText(value).catch(() => undefined);
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </span>
  );
}

export function TokenStatusBadge({
  tok,
  t,
  nowMs,
}: {
  readonly tok: {
    readonly revoked_at: string | null;
    readonly used_at: string | null;
    readonly expires_at: string;
  };
  readonly t: GuardTranslate;
  readonly nowMs: number;
}) {
  if (tok.revoked_at) {
    return <Badge variant="info">{t("statusRevoked")}</Badge>;
  }
  if (new Date(tok.expires_at).getTime() < nowMs) {
    return (
      <Badge className="border border-border bg-muted text-foreground">
        {t("statusExpired")}
      </Badge>
    );
  }
  if (tok.used_at) {
    return (
      <Badge className="border border-border bg-muted text-foreground">
        {t("statusUsed")}
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-500/15 text-emerald-600">
      {t("statusReady")}
    </Badge>
  );
}

export function AgentStatusBadge({
  status,
  t,
  disabled,
}: {
  readonly status: string;
  readonly t: GuardTranslate;
  readonly disabled?: boolean;
}) {
  if (disabled) {
    return (
      <Badge className="border border-border bg-muted text-foreground">
        {t("statusDisabled")}
      </Badge>
    );
  }
  const normalized = status.toLowerCase();
  if (normalized === "active") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600">{t("online")}</Badge>
    );
  }
  if (normalized === "disconnected") {
    return (
      <Badge className="bg-amber-500/15 text-amber-700">
        {t("disconnected")}
      </Badge>
    );
  }
  if (normalized === "pending") {
    return <Badge className="bg-sky-500/15 text-sky-700">{t("pending")}</Badge>;
  }
  return <Badge variant="info">{status}</Badge>;
}
