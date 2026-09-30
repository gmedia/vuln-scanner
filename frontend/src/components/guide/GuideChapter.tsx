import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tocIndex, type TocId } from "@/components/guide/guideMeta";

const STEP_CLASS = [
  "space-y-3 [counter-reset:guide-step]",
  "[&>li]:relative [&>li]:pl-10 [&>li]:text-sm [&>li]:leading-relaxed [&>li]:text-muted-foreground",
  "[&>li]:[counter-increment:guide-step]",
  "[&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-0",
  "[&>li]:before:flex [&>li]:before:h-7 [&>li]:before:w-7",
  "[&>li]:before:items-center [&>li]:before:justify-center",
  "[&>li]:before:rounded-md [&>li]:before:border [&>li]:before:border-border",
  "[&>li]:before:bg-muted/40 [&>li]:before:font-mono [&>li]:before:text-[11px]",
  "[&>li]:before:font-medium [&>li]:before:tabular-nums [&>li]:before:text-foreground",
  "[&>li]:before:content-[counter(guide-step)]",
].join(" ");

export function GuideChapter({
  id,
  icon: Icon,
  title,
  tone,
  children,
}: {
  id: TocId;
  icon: LucideIcon;
  title: string;
  tone?: "runtime" | "limits";
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card",
        tone === "limits" && "border-destructive/30",
      )}
    >
      {tone === "runtime" ? (
        <div className="h-px bg-primary/40" aria-hidden />
      ) : null}
      <div className="flex items-stretch border-b border-border">
        <div
          aria-hidden
          className="flex w-12 shrink-0 items-center justify-center border-r border-border bg-muted/40 font-mono text-base font-semibold tabular-nums text-muted-foreground sm:w-14 sm:text-lg"
        >
          {tocIndex(id)}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </span>
          <h2
            id={id}
            className="scroll-mt-24 text-xl font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
        </div>
      </div>
      <div className="space-y-4 p-4 md:px-5 md:py-5">{children}</div>
    </article>
  );
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className={STEP_CLASS}>{children}</ol>;
}

export function GuideIntro({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function GuideNote({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-2 border-primary bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export function GuidePre({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <pre
      className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground"
      data-testid={testId}
    >
      {children}
    </pre>
  );
}
