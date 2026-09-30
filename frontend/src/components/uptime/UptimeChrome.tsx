import { Activity, Globe, HeartPulse, Network, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProtocolGlyph({
  type,
  className,
}: {
  readonly type: string;
  readonly className?: string;
}) {
  const cls = cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className);
  if (type === "http") return <Globe className={cls} aria-hidden />;
  if (type === "tcp") return <Network className={cls} aria-hidden />;
  if (type === "heartbeat") return <HeartPulse className={cls} aria-hidden />;
  if (type === "dns") return <Radio className={cls} aria-hidden />;
  return <Activity className={cls} aria-hidden />;
}
