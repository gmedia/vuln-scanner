type Translate = (key: string) => string;

export function caseStatusLabel(
  status: "open" | "ack" | "closed",
  t: Translate,
): string {
  if (status === "open") return t("statusOpenBtn");
  if (status === "ack") return t("statusAckBtn");
  return t("statusClosedBtn");
}

export function caseStatusRailClass(status: string): string {
  if (status === "open") return "bg-sky-500";
  if (status === "ack") return "bg-amber-500";
  if (status === "closed") return "bg-primary";
  return "bg-muted-foreground";
}
