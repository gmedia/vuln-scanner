import { Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HostWafEvent } from "@/api/hostWaf";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/Pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

export const HOST_WAF_EVENTS_PAGE_SIZE = 20;

type HostWafEventsListProps = {
  readonly events: readonly HostWafEvent[];
  readonly page: number;
  readonly pages: number;
  readonly onPageChange: (page: number) => void;
};

function actionVariant(action: HostWafEvent["action"]) {
  return action === "block" ? ("failed" as const) : ("default" as const);
}

export function HostWafEventsList({
  events,
  page,
  pages,
  onPageChange,
}: HostWafEventsListProps) {
  const { t } = useTranslation("host");
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t("wafEvents")}</h3>
        <p
          className="max-w-prose text-xs text-muted-foreground"
          data-testid="host-waf-events-hint"
        >
          {t("wafEventsHint")}
        </p>
      </div>
      {events.length === 0 ? (
        <Card data-testid="host-waf-events-empty">
          <CardContent className="flex min-h-[8rem] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <Shield className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">{t("wafEvents")}</p>
            <p className="max-w-md text-xs text-muted-foreground">
              {t("wafEventsEmpty")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div data-testid="host-waf-events">
          <div
            className="space-y-2 md:hidden"
            data-testid="host-waf-events-mobile"
          >
            {events.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-border bg-card p-3"
                data-testid={`host-waf-event-card-${e.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 break-all font-mono text-xs font-medium text-foreground">
                    {e.path}
                  </p>
                  <Badge variant="default" className="shrink-0">
                    {e.method}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant={actionVariant(e.action)}>{e.action}</Badge>
                  <Badge variant="default" className="font-mono">
                    {e.rule_id}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          <div
            className="hidden overflow-x-auto md:block"
            data-testid="host-waf-events-desktop"
          >
            <div className="overflow-hidden rounded-md border border-border bg-card">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[15%]">{t("wafColAction")}</TableHead>
                    <TableHead className="w-[20%]">{t("wafColRule")}</TableHead>
                    <TableHead className="w-[15%]">{t("wafColMethod")}</TableHead>
                    <TableHead className="w-1/2">{t("colPath")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Badge variant={actionVariant(e.action)}>
                          {e.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="font-mono">
                          {e.rule_id}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">{e.method}</Badge>
                      </TableCell>
                      <TableCell className="break-all font-mono text-xs">
                        {e.path}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
      {pages > 1 ? (
        <Pagination className="mt-4" data-testid="host-waf-events-pagination">
          <PaginationContent className="flex-wrap justify-center gap-1">
            <PaginationItem>
              <PaginationPrevious
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page === 1}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-2 font-mono text-xs tabular-nums text-muted-foreground">
                {t("wafPageOf", { page, total: pages })}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => onPageChange(Math.min(pages, page + 1))}
                disabled={page === pages}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}
