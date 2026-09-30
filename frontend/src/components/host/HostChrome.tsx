import { cn } from "@/lib/utils";

export function HostLiveDot({
  className,
  tone = "primary",
}: {
  readonly className?: string;
  readonly tone?: "primary" | "destructive" | "info";
}) {
  const color =
    tone === "destructive"
      ? "bg-destructive"
      : tone === "info"
        ? "bg-blue-500"
        : "bg-primary";
  return (
    <span
      className={cn("relative flex h-2 w-2 shrink-0", className)}
      aria-hidden
    >
      <span
        className={cn(
          "absolute inline-flex h-full w-full animate-ping rounded-full opacity-40",
          color,
        )}
      />
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}
