import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export interface FilterSheetApi {
  readonly close: () => void;
}

export function FilterSheet({
  activeCount = 0,
  triggerTestId,
  sheetTestId,
  children,
}: {
  readonly activeCount?: number;
  readonly triggerTestId?: string;
  readonly sheetTestId?: string;
  readonly children: (api: FilterSheetApi) => ReactNode;
}) {
  const { t } = useTranslation("common");
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!isMobile) {
    return <>{children({ close: () => undefined })}</>;
  }

  const close = () => setOpen(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        data-testid={triggerTestId}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden />
        {t("filters")}
        {activeCount > 0 ? (
          <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
            {activeCount}
          </span>
        ) : null}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85svh]"
          data-testid={sheetTestId}
          closeLabel={t("common:close")}
        >
          <SheetHeader>
            <SheetTitle>{t("filters")}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
            {children({ close })}
          </div>
          <SheetFooter>
            <Button
              type="button"
              className="min-h-11 w-full"
              data-testid={sheetTestId ? `${sheetTestId}-done` : undefined}
              onClick={close}
            >
              {t("done")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
