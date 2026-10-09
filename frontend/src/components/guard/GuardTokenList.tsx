import type { GuardEnrollTokenMeta } from "@/api/guard";
import { CopyableId, TokenStatusBadge } from "@/components/guard/guardChrome";
import {
  formatWhen,
  tokenRowClass,
  type GuardTranslate,
} from "@/components/guard/guardFormat";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function TokenRevokeButton({
  tok,
  t,
  disabled,
  onRevoke,
}: {
  readonly tok: { readonly id: string; readonly label: string | null };
  readonly t: GuardTranslate;
  readonly disabled: boolean;
  readonly onRevoke: (id: string) => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 text-xs text-destructive"
          aria-label={t("revokeTokenAria", { label: tok.label || tok.id })}
          disabled={disabled}
        >
          {t("revoke")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("revokeConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("revokeConfirmBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={() => onRevoke(tok.id)}
          >
            {t("revoke")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function GuardTokenList({
  loading,
  tokens,
  visibleTokens,
  tokenExpired,
  nowMs,
  dateLocale,
  showAllTokens,
  unusedCount,
  revokePending,
  onToggleMore,
  onRevoke,
  t,
}: {
  readonly loading: boolean;
  readonly tokens: readonly GuardEnrollTokenMeta[];
  readonly visibleTokens: readonly GuardEnrollTokenMeta[];
  readonly tokenExpired: (tok: GuardEnrollTokenMeta) => boolean;
  readonly nowMs: number;
  readonly dateLocale: string;
  readonly showAllTokens: boolean;
  readonly unusedCount: number;
  readonly revokePending: boolean;
  readonly onToggleMore: () => void;
  readonly onRevoke: (id: string) => void;
  readonly t: GuardTranslate;
}) {
  if (loading) return <TableRowSkeleton rows={3} columns={4} />;
  return (
    <>
      <div className="space-y-2 md:hidden">
        {visibleTokens.map((tok) => (
          <div
            key={tok.id}
            className={`overflow-hidden rounded-lg border border-border bg-card p-3 ${tokenRowClass(tokenExpired(tok), !!tok.revoked_at) ?? ""}`}
            data-testid="guard-enroll-token-card"
          >
            <p className="truncate font-medium" title={tok.label || tok.id}>
              {tok.label || t("tokenFallback")}
            </p>
            <CopyableId value={tok.id} label={t("copyCurl")} />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("colExpires")}: {formatWhen(tok.expires_at, dateLocale)}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <TokenStatusBadge tok={tok} t={t} nowMs={nowMs} />
              {!tok.revoked_at ? (
                <TokenRevokeButton
                  tok={tok}
                  t={t}
                  disabled={revokePending}
                  onRevoke={onRevoke}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table className="min-w-[36rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[10rem]">{t("colLabel")}</TableHead>
              <TableHead className="min-w-[9.5rem]">{t("colExpires")}</TableHead>
              <TableHead className="min-w-[7rem]">{t("colStatus")}</TableHead>
              <TableHead className="min-w-[4.5rem]">{t("colAction")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleTokens.map((tok) => (
              <TableRow
                key={tok.id}
                data-testid="guard-enroll-token-row"
                className={tokenRowClass(tokenExpired(tok), !!tok.revoked_at)}
              >
                <TableCell className="max-w-[14rem]">
                  <span
                    className="block truncate font-medium"
                    title={tok.label || tok.id}
                  >
                    {tok.label || t("tokenFallback")}
                  </span>
                  <CopyableId value={tok.id} label={t("copyCurl")} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatWhen(tok.expires_at, dateLocale)}
                </TableCell>
                <TableCell>
                  <TokenStatusBadge tok={tok} t={t} nowMs={nowMs} />
                </TableCell>
                <TableCell>
                  {!tok.revoked_at ? (
                    <TokenRevokeButton
                      tok={tok}
                      t={t}
                      disabled={revokePending}
                      onRevoke={onRevoke}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {tokens.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          <span>
            {t("tokenSummary", {
              count: tokens.length,
              total: tokens.length,
              unused: unusedCount,
            })}
            {tokens.length > 5
              ? t("tokenShowing", {
                  visible: visibleTokens.length,
                  total: tokens.length,
                })
              : ""}
          </span>
          {tokens.length > 5 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-primary"
              onClick={onToggleMore}
            >
              {showAllTokens
                ? t("showFewer")
                : t("showMore", { count: tokens.length - 5 })}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
