import { cn } from "@/lib/utils";
import {
  GUIDE_GROUPS,
  GROUP_ICONS,
  groupAnchor,
  groupContains,
  tocIndex,
  type TocId,
} from "@/components/guide/guideMeta";

type GuideT = (key: string) => string;

export function GuideJumpMap({
  activeId,
  t,
}: {
  activeId: TocId;
  t: GuideT;
}) {
  return (
    <nav aria-label={t("jumpAria")} className="mt-5">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {GUIDE_GROUPS.map((group) => {
          const Icon = GROUP_ICONS[group.id];
          const anchor = groupAnchor(group);
          const isActive = groupContains(group, activeId);
          const first = tocIndex(group.ids[0]);
          const last = tocIndex(group.ids[group.ids.length - 1]);
          const range = first === last ? first : `${first}–${last}`;
          return (
            <a
              key={group.id}
              href={`#${anchor}`}
              className={cn(
                "flex min-h-11 items-start gap-3 rounded-md border border-border bg-background px-3 py-3 transition-colors",
                "hover:border-primary/40 hover:bg-muted/40",
                isActive && "border-primary/50 bg-primary/10",
              )}
            >
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40"
                aria-hidden
              >
                <Icon className="h-4 w-4 text-primary" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-foreground">
                    {t(`groups.${group.id}`)}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-primary">
                    {range}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {t(`groupBlurb.${group.id}`)}
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
