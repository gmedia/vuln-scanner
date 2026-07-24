import type { ReactNode } from "react";
import { Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuthLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  maxWidth?: "sm" | "md";
}

const maxWidthClass = {
  sm: "max-w-sm",
  md: "max-w-md",
} as const;

function AuthLayout({
  children,
  title,
  subtitle,
  maxWidth = "md",
}: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute left-1/2 top-1/3 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-48 w-48 rounded-full bg-primary/5 blur-2xl" />
      </div>

      <div className={cn("relative z-10 w-full", maxWidthClass[maxWidth])}>
        <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
          <div className="flex items-center gap-2.5">
            <Crosshair className="h-5 w-5 text-primary" />
            <span className="font-mono text-sm font-bold tracking-wider text-foreground">
              VULN<span className="text-primary">SCAN</span>
            </span>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Web-based vulnerability scanner
          </p>
        </div>

        {(title || subtitle) && (
          <div className="mb-4 space-y-1 text-center">
            {title && (
              <h1 className="font-mono text-lg font-semibold tracking-wide text-foreground">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="font-mono text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

export default AuthLayout;
export { AuthLayout };
