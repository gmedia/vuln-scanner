import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SiemRail } from "@/components/siem/siemChrome";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

/**
 * One metric tile for ops consoles.
 *
 * The canonical surface is a bordered card with a 2px `SiemRail`, a 10px
 * uppercase label, and a mono tabular value. Every KPI strip in the app used
 * to re-declare that markup; this is the single implementation.
 *
 * Variants exist only for surfaces that legitimately differ:
 * - `rounded` / `inset` — `/credit-history` and `/ai` use a tighter card.
 * - `railClass={null}` — `/ai` wallet tiles have no rail.
 * - `valueFirst` — `/dashboard` prints the number above the label.
 * - `icon` — `/scan` and `/admin` put an icon in the label row.
 * - `isLoading` + `skeleton` — strips that render placeholder blocks.
 */
export type StatTileProps = {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly testid?: string;
  readonly className?: string;
  /** Tailwind background class for the 2px rail. `null` removes the rail. */
  readonly railClass?: string | null;
  readonly rounded?: "md" | "lg";
  /** Horizontal inset for the label/value block. */
  readonly inset?: "tile" | "tight" | "none";
  readonly icon?: LucideIcon;
  readonly iconClassName?: string;
  readonly pulse?: ReactNode;
  readonly valueClassName?: string;
  readonly labelClassName?: string;
  readonly valueLayout?: "flex" | "text";
  readonly valueFirst?: boolean;
  readonly extra?: ReactNode;
  /** `inline` keeps the extra node in the value row (Guard degraded badge). */
  readonly extraPlacement?: "below" | "inline";
  readonly isLoading?: boolean;
  readonly skeleton?: ReactNode;
};

const RADIUS: Record<NonNullable<StatTileProps["rounded"]>, string> = {
  md: "rounded-md",
  lg: "rounded-lg",
};

const INSET: Record<NonNullable<StatTileProps["inset"]>, string> = {
  tile: "pl-2",
  tight: "pl-1",
  none: "",
};

const LABEL =
  "text-[10px] font-medium uppercase tracking-wider text-muted-foreground";
const VALUE =
  "mt-1 font-mono text-lg font-bold tabular-nums text-foreground";
const VALUE_TEXT =
  "font-mono text-lg font-bold tabular-nums text-foreground";

function TileBody({
  label,
  value,
  icon: Icon,
  iconClassName,
  pulse,
  valueClassName,
  labelClassName,
  valueLayout,
  valueFirst,
  extra,
  extraPlacement = "below",
  inset,
}: Pick<
  StatTileProps,
  | "label"
  | "value"
  | "icon"
  | "iconClassName"
  | "pulse"
  | "valueClassName"
  | "labelClassName"
  | "valueLayout"
  | "valueFirst"
  | "extra"
  | "extraPlacement"
  | "inset"
>) {
  const pad = INSET[inset ?? "tile"];
  const labelNode = (
    <p className={cn(LABEL, pad, labelClassName)}>{label}</p>
  );
  const valueNode =
    valueLayout === "text" ? (
      <p className={cn(VALUE, "truncate", pad, valueClassName)}>{value}</p>
    ) : (
      <div
        className={cn(
          VALUE,
          "flex min-w-0 flex-wrap items-center gap-2",
          pad,
          valueClassName,
        )}
      >
        {value}
        {valueFirst || Icon ? null : pulse}
        {extraPlacement === "inline" ? extra : null}
      </div>
    );

  if (valueFirst) {
    return (
      <div className={pad}>
        <span className={cn(VALUE_TEXT, "block", valueClassName)}>{value}</span>
        <span
          className={cn(
            "mt-1 flex items-center gap-2",
            LABEL,
            labelClassName,
          )}
        >
          {label}
          {pulse}
        </span>
      </div>
    );
  }

  return (
    <>
      {Icon ? (
        <div className={cn("flex items-center gap-2", pad)}>
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground",
              iconClassName,
            )}
            aria-hidden
          />
          <p className={cn(LABEL, "min-w-0 truncate", labelClassName)}>
            {label}
          </p>
          {pulse}
        </div>
      ) : (
        labelNode
      )}
      {valueNode}
      {extra && extraPlacement === "below" ? (
        <div className={cn("mt-2", pad)}>{extra}</div>
      ) : null}
    </>
  );
}

export function StatTile({
  label,
  value,
  testid,
  className,
  railClass = "bg-border",
  rounded = "lg",
  inset = "tile",
  icon,
  iconClassName,
  pulse,
  valueClassName,
  labelClassName,
  valueLayout = "flex",
  valueFirst = false,
  extra,
  extraPlacement = "below",
  isLoading = false,
  skeleton,
}: StatTileProps) {
  return (
    <div
      data-testid={testid}
      className={cn(
        "relative min-w-0 overflow-hidden border border-border bg-card px-4 py-3 pl-4",
        RADIUS[rounded],
        className,
      )}
    >
      {railClass ? <SiemRail className={railClass} /> : null}
      {isLoading ? (
        (skeleton ?? <Skeleton className="mt-1.5 h-7 w-20" />)
      ) : (
        <TileBody
          label={label}
          value={value}
          icon={icon}
          iconClassName={iconClassName}
          pulse={pulse}
          valueClassName={valueClassName}
          labelClassName={labelClassName}
          valueLayout={valueLayout}
          valueFirst={valueFirst}
          extra={extra}
          extraPlacement={extraPlacement}
          inset={inset}
        />
      )}
    </div>
  );
}

/** Grid wrapper so every KPI strip shares the same responsive columns. */
export function StatGrid({
  children,
  testid,
  className,
  label,
  as: Tag = "div",
}: {
  readonly children: ReactNode;
  readonly testid?: string;
  readonly className?: string;
  readonly label?: string;
  readonly as?: "div" | "section";
}) {
  return (
    <Tag
      data-testid={testid}
      aria-label={label}
      className={cn("grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4", className)}
    >
      {children}
    </Tag>
  );
}

/** Placeholder grid for strips that load before their data. */
export function StatGridSkeleton({
  testid,
  className,
  count = 4,
}: {
  readonly testid?: string;
  readonly className?: string;
  readonly count?: number;
}) {
  return (
    <div
      data-testid={testid}
      className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-[4.5rem] rounded-lg" />
      ))}
    </div>
  );
}
