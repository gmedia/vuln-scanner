import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { AiUsageAdmin } from "@/api/admin";
import {
  formatIdr,
  formatLatencyMs,
  formatTps,
} from "@/components/admin/aiFormat";
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
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-muted-foreground">
                <div>
                  <dt className="inline">{t("aiHttpStatus")}: </dt>
                  <dd className="inline text-foreground">
                    {u.http_status ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="inline">{t("aiTokenIn")}: </dt>
                  <dd className="inline text-foreground">{u.prompt_tokens}</dd>
                </div>
                <div>
                  <dt className="inline">{t("aiTokenOut")}: </dt>
                  <dd className="inline text-foreground">
                    {u.completion_tokens}
                  </dd>
                </div>
                <div>
                  <dt className="inline">{t("aiCache")}: </dt>
                  <dd className="inline text-foreground">
                    {u.cached_tokens ?? 0}
                  </dd>
                </div>
                <div>
                  <dt className="inline">{t("aiTtft")}: </dt>
                  <dd className="inline text-foreground">
                    {formatLatencyMs(u.ttft_ms)}
                  </dd>
                </div>
                <div>
                  <dt className="inline">{t("aiTps")}: </dt>
                  <dd className="inline text-foreground">
                    {formatTps(u.tps)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
                {t("aiBilled")}: {formatIdr(u.billed_idr)}
              </p>
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onToggle(u.id)}
                >
                  {open ? t("aiCancel") : t("aiRequest")}
                </Button>
              </div>
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
              <TableHead>{t("aiHttpStatus")}</TableHead>
              <TableHead>{t("aiTokenIn")}</TableHead>
              <TableHead>{t("aiTokenOut")}</TableHead>
              <TableHead>{t("aiCache")}</TableHead>
              <TableHead>{t("aiTtft")}</TableHead>
              <TableHead>{t("aiTps")}</TableHead>
              <TableHead>{t("aiBilled")}</TableHead>
              <TableHead className="text-right">{t("colActions")}</TableHead>
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
                    <TableCell className="font-mono tabular-nums">
                      {u.http_status ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {u.prompt_tokens}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {u.completion_tokens}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {u.cached_tokens ?? 0}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {formatLatencyMs(u.ttft_ms)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {formatTps(u.tps)}
                    </TableCell>
                    <TableCell>{formatIdr(u.billed_idr)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
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
                      <TableCell colSpan={10}>
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
