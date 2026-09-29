import { cn } from "@/lib/utils";
import {
  GUIDE_GROUPS,
  HEADING_KEYS,
  ICON_BY_ID,
  TOC_IDS,
  tocIndex,
  type TocId,
} from "@/components/guide/guideMeta";

type GuideT = (key: string) => string;

function tileClass(isActive: boolean, extra?: string) {
  return cn(
    "rounded-md border border-border bg-background transition-colors",
    "hover:border-primary/40 hover:bg-muted/40",
    isActive && "border-primary/50 bg-primary/10",
    extra,
  );
}

function JumpChip({
  id,
  activeId,
  t,
}: {
  id: TocId;
  activeId: TocId;
  t: GuideT;
}) {
  return (
    <a
      href={`#${id}`}
      className={tileClass(
        id === activeId,
        "flex h-10 min-h-10 shrink-0 items-center gap-1.5 px-2.5",
      )}
    >
      <span className="font-mono text-[10px] tabular-nums text-primary">
        {tocIndex(id)}
      </span>
      <span className="whitespace-nowrap text-xs font-medium text-foreground">
        {t(HEADING_KEYS[id])}
      </span>
    </a>
  );
}

function JumpTile({
  id,
  activeId,
  t,
}: {
  id: TocId;
  activeId: TocId;
  t: GuideT;
}) {
  const Icon = ICON_BY_ID[id];
  return (
    <a
      href={`#${id}`}
      className={tileClass(
        id === activeId,
        "flex min-h-11 items-start gap-2 px-3 py-2.5",
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block font-mono text-[10px] tabular-nums text-primary">
          {tocIndex(id)}
        </span>
        <span className="block text-xs font-medium leading-snug text-foreground">
          {t(HEADING_KEYS[id])}
        </span>
      </span>
    </a>
  );
}

export function GuideJumpMap({
  activeId,
  t,
}: {
  activeId: TocId;
  t: GuideT;
}) {
  return (
    <nav aria-label={t("jumpAria")} className="mt-5">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:hidden">
        {TOC_IDS.map((id) => (
          <JumpChip key={id} id={id} activeId={activeId} t={t} />
        ))}
      </div>
      <div className="hidden space-y-4 sm:block">
        {GUIDE_GROUPS.map((group) => (
          <div key={group.id}>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t(`groups.${group.id}`)}
            </p>
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">
              {group.ids.map((id) => (
                <JumpTile key={id} id={id} activeId={activeId} t={t} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
