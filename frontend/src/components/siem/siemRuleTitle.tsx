import type { SiemEvent } from "@/api/siem";

export function siemRuleTitle(ev: SiemEvent) {
  return (
    <>
      {ev.rule_description}
      {ev.rule_id ? (
        <span className="ml-1 text-xs text-muted-foreground">#{ev.rule_id}</span>
      ) : null}
    </>
  );
}
