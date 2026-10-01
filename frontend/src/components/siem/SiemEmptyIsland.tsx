import type { LucideIcon } from "lucide-react";

export function SiemEmptyIsland({
  icon: Icon,
  title,
  testId,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly testId?: string;
}) {
  return (
    <div
      className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center"
      data-testid={testId}
    >
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{title}</p>
    </div>
  );
}
