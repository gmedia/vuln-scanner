import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

export interface BrandMarkProps {
  to?: string | false;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showIcon?: boolean;
  onClick?: () => void;
  "aria-label"?: string;
  children?: ReactNode;
}

function BrandMark({
  to = "/",
  className,
  iconClassName,
  textClassName,
  showIcon = true,
  onClick,
  "aria-label": ariaLabel = BRAND.homeAriaLabel,
  children,
}: BrandMarkProps) {
  const mark = (
    <>
      {showIcon && (
        <Crosshair
          className={cn("h-5 w-5 shrink-0 text-primary", iconClassName)}
          aria-hidden
        />
      )}
      <span
        className={cn(
          "font-mono text-sm font-bold tracking-wider text-foreground",
          textClassName,
        )}
      >
        {BRAND.markPrimary}
        <span className="text-primary">{BRAND.markAccent}</span>
      </span>
      {children}
    </>
  );

  if (to === false) {
    return (
      <span className={cn("inline-flex items-center gap-2.5", className)}>
        {mark}
      </span>
    );
  }

  return (
    <Link
      to={to}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-2.5 transition-opacity hover:opacity-90",
        className,
      )}
    >
      {mark}
    </Link>
  );
}

export default BrandMark;
export { BrandMark };
