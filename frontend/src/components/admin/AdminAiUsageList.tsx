import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { AiUsageAdmin } from "@/api/admin";
import { formatIdr } from "@/components/admin/aiFormat";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

function PayloadBlock({
  title,
  payload,
  empty,
}: {
  readonly title: string;
  readonly payload: unknown;
  readonly empty: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium">{title}</p>
      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
        {payload ? JSON.stringify(payload, null, 2) : empty}
      </pre>
    </div>
  );
}

export function AdminAiUsageList({
  items,
  openUsageId,
  onToggle,
}: {
  readonly items: readonly AiUsageAdmin[];
  readonly openUsageId: string | null;
  readonly onToggle: (id: string) => void;
}) {
  const { t } = useTranslation("admin");
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("aiUsageEmpty")}</p>;
  }
  return (
    <>
      <div className="space-y-2 md:hidden" data-testid="admin-ai-usage-mobile">
        {items.map((u) => {
          const open = openUsageId === u.id;
          return (
            <div
              key={u.id}
              className="rounded-lg border border-border bg-card p-3"
              data-testid={`admin-ai-usage-card-${u.id}`}
            >
              <p className="min-w-0 break-all font-mono text-sm font-medium text-foreground">
                {u.model_public_id}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{u.source}</p>
              <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                {t("aiBilled")}: {formatIdr(u.billed_idr)}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => onToggle(u.id)}
              >
                {open ? t("aiCancel") : t("aiRequest")}
              </Button>
              {open ? (
                <div className="mt-3 grid gap-3">
                  <PayloadBlock
                    title={t("aiRequest")}
                    payload={u.request_payload}
                    empty={t("aiNoPayload")}
                  />
                  <PayloadBlock
                    title={t("aiResponse")}
                    payload={u.response_payload}
                    empty={t("aiNoPayload")}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block" data-testid="admin-ai-usage-desktop">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("aiPublicId")}</TableHead>
              <TableHead>{t("aiSource")}</TableHead>
              <TableHead>{t("aiBilled")}</TableHead>
              <TableHead>{t("colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((u) => {
              const open = openUsageId === u.id;
              return (
                <Fragment key={u.id}>
                  <TableRow>
                    <TableCell>{u.model_public_id}</TableCell>
                    <TableCell>{u.source}</TableCell>
                    <TableCell>{formatIdr(u.billed_idr)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onToggle(u.id)}
                      >
                        {open ? t("aiCancel") : t("aiRequest")}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {open ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <PayloadBlock
                            title={t("aiRequest")}
                            payload={u.request_payload}
                            empty={t("aiNoPayload")}
                          />
                          <PayloadBlock
                            title={t("aiResponse")}
                            payload={u.response_payload}
                            empty={t("aiNoPayload")}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
