import { Button } from "@/components/ui/Button";

type EventPagerProps = {
  readonly count: number;
  readonly page: number;
  readonly pages: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly t: (key: string, options?: Record<string, number>) => string;
};

export function EventPager({
  count,
  page,
  pages,
  onPrev,
  onNext,
  t,
}: EventPagerProps) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
      data-testid="siem-event-pager"
    >
      <span>
        {t("eventPager", {
          count,
          page,
          pages,
        })}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={onPrev}
        >
          {t("prev")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={onNext}
        >
          {t("next")}
        </Button>
      </div>
    </div>
  );
}
