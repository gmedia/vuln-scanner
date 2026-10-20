import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CreditCard,
  Gauge,
  Landmark,
  Loader2,
  Receipt,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import PageHeader from "@/components/layout/PageHeader";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/Accordion";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Progress } from "@/components/ui/Progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/patterns/EmptyState";
import { StatGrid, StatTile } from "@/components/patterns/StatTile";
import { WorkspaceInvoiceCard } from "@/components/invoice/WorkspaceInvoiceCard";
import { InvoicePrintSheet, useInvoicePrint } from "@/components/invoice/InvoicePrintSheet";
import {
  WorkspaceNotice,
  WorkspaceShell,
  WorkspaceShellBody,
  WorkspaceShellHead,
} from "@/components/workspace/WorkspaceShell";
import {
  planBadgeVariant,
  planTone,
} from "@/components/subscription/subscriptionChrome";
import { useAuthStore } from "@/store/authStore";
import { cn, type ApiError } from "@/lib/utils";
import { quotaRailClass, quotaState } from "@/lib/quota";
import {
  cancelSubscriptionRequest,
  createSubscriptionRequest,
  getSubscription,
  type SubscriptionCycle,
  type SubscriptionOverview,
  type SubscriptionTier,
  type SubscriptionUsageItem,
} from "@/api/subscription";
import {
  downloadOrgInvoicePdf,
  listOrgInvoices,
  type OrgInvoiceItem,
} from "@/api/orgs";

const TIERS: SubscriptionTier[] = ["basic", "pro", "multi"];
const PRODUCTS = ["scan", "host", "uptime", "guard"] as const;
const SKU_RANK: Record<string, number> = {
  basic: 1,
  pro: 2,
  multi: 3,
  enterprise: 4,
};

function apiDetail(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const detail = (err as ApiError).response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

function formatIdr(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function tierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function usageTone(item: SubscriptionUsageItem): string {
  if (item.limit == null) return quotaRailClass("ok");
  return quotaRailClass(quotaState(item.used, item.limit).tone);
}

function UsageTile({ item }: { readonly item: SubscriptionUsageItem }) {
  const { t } = useTranslation("subscription");
  const limit = item.limit;
  const state = limit != null ? quotaState(item.used, limit) : null;
  const value =
    limit != null
      ? t("usageValue", { used: item.used, limit })
      : t("usageUnlimited", { used: item.used });
  return (
    <StatTile
      testid={`subscription-usage-${item.product}`}
      label={t(`product_${item.product}`)}
      value={value}
      extra={
        <div className="space-y-1">
          <Progress
            value={state?.pct ?? 0}
            indicatorClassName={usageTone(item)}
            aria-label={`${t(`product_${item.product}`)} ${value}`}
          />
          {state?.atCap ? (
            <p className="text-[11px] text-destructive">{t("usageFull")}</p>
          ) : state?.tone === "warn" ? (
            <p className="text-[11px] text-muted-foreground">{t("usageWarn")}</p>
          ) : null}
        </div>
      }
    />
  );
}

function PlanCard({
  overview,
  tier,
  cycle,
  canRequest,
  onRequest,
}: {
  readonly overview: SubscriptionOverview;
  readonly tier: SubscriptionTier;
  readonly cycle: SubscriptionCycle;
  readonly canRequest: boolean;
  readonly onRequest: (tier: SubscriptionTier) => void;
}) {
  const { t } = useTranslation("subscription");
  const bundle = overview.bundles.find((item) => item.tier === tier);
  const items = overview.catalog.filter((item) => item.sku === tier);
  const current = overview.plan.sku === tier;
  const currentRank = SKU_RANK[overview.plan.sku] ?? 0;
  const targetRank = SKU_RANK[tier] ?? 0;
  const annual = cycle === "annual";
  const monthlyPrice = bundle?.bundle_idr ?? 0;
  const billed = annual
    ? monthlyPrice * overview.annual.months_paid
    : monthlyPrice;
  const cta = current
    ? t("currentPlan")
    : targetRank > currentRank
      ? t("upgradeTo", { tier: tierLabel(tier) })
      : t("downgradeTo", { tier: tierLabel(tier) });

  return (
    <Card
      className={cn("flex h-full flex-col", current && "border-primary")}
      data-testid={`subscription-plan-${tier}`}
    >
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm tracking-wide">
            Sinexis Secure — {tierLabel(tier)}
          </CardTitle>
          {current ? (
            <Badge variant="success" className="shrink-0 text-[10px] uppercase">
              {t("currentPlan")}
            </Badge>
          ) : null}
        </div>
        <div>
          <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
            {formatIdr(billed)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {annual ? t("perYear") : t("perMonth")}
            </span>
          </p>
          {annual ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("annualMonthly", {
                monthly: monthlyPrice.toLocaleString("id-ID"),
              })}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        <ul className="space-y-1.5 text-xs text-foreground">
          {items.map((item) => (
            <li key={item.service} className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 shrink-0 text-primary-text" aria-hidden />
              <span>
                {t(`product_${item.service}`)}:{" "}
                <span className="font-mono tabular-nums">{item.seats}</span>
              </span>
            </li>
          ))}
          <li className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 shrink-0 text-primary-text" aria-hidden />
            <span>
              {t("workspaceSeats")}:{" "}
              <span className="font-mono tabular-nums">
                {tier === "basic"
                  ? t("workspaceSeatsBasicPlan")
                  : t("workspaceSeatsCustom")}
              </span>
            </span>
          </li>
        </ul>
        {bundle ? (
          <p className="text-[11px] text-muted-foreground">
            {t("alacarteDescription")}
          </p>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          className="w-full"
          variant={current ? "outline" : "default"}
          disabled={current || !canRequest}
          onClick={() => onRequest(tier)}
          data-testid={`subscription-choose-${tier}`}
        >
          {cta}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Subscription() {
  const { t, i18n } = useTranslation("subscription");
  const qc = useQueryClient();
  const dateLocale = i18n.language === "en" ? "en-US" : "id-ID";
  const organizations = useAuthStore((s) => s.organizations);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const activeRole = useAuthStore((s) => s.activeRole);
  const orgId = activeOrgId ?? organizations[0]?.id ?? null;
  const role = activeRole();
  const canManage = role === "owner" || role === "admin";

  const [cycle, setCycle] = useState<SubscriptionCycle>("monthly");
  const [requestTarget, setRequestTarget] = useState<SubscriptionTier | null>(null);
  const [requestNote, setRequestNote] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("all");
  const { printing, startPrint } = useInvoicePrint();

  const subscriptionQuery = useQuery({
    queryKey: ["org-subscription", orgId],
    queryFn: () => getSubscription(orgId!),
    enabled: !!orgId,
    retry: false,
  });

  const invoicesQuery = useQuery({
    queryKey: ["org-invoices", orgId],
    queryFn: () => listOrgInvoices(orgId!),
    enabled: !!orgId && canManage,
    retry: false,
  });

  const requestMut = useMutation({
    mutationFn: (target: SubscriptionTier) =>
      createSubscriptionRequest(orgId!, {
        target_sku: target,
        cycle,
        note: requestNote.trim(),
      }),
    onSuccess: () => {
      toast.success(t("requestSent"));
      setRequestTarget(null);
      setRequestNote("");
      void qc.invalidateQueries({ queryKey: ["org-subscription", orgId] });
    },
    onError: (err: unknown) => {
      toast.error(apiDetail(err, t("requestFail")));
    },
  });

  const cancelMut = useMutation({
    mutationFn: (requestId: string) => cancelSubscriptionRequest(orgId!, requestId),
    onSuccess: () => {
      toast.success(t("pendingCanceled"));
      void qc.invalidateQueries({ queryKey: ["org-subscription", orgId] });
    },
    onError: (err: unknown) => {
      toast.error(apiDetail(err, t("pendingCancelFail")));
    },
  });

  const invoices = invoicesQuery.data?.items ?? [];
  const filteredInvoices =
    invoiceStatus === "all"
      ? invoices
      : invoices.filter((invoice) => invoice.status === invoiceStatus);

  async function downloadPdf(invoice: OrgInvoiceItem) {
    if (!orgId) return;
    try {
      await downloadOrgInvoicePdf(orgId, invoice.id, invoice.number);
    } catch {
      toast.error(t("invoicesLoadError"));
    }
  }

  function scrollToPlans() {
    document.getElementById("subscription-plans")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  if (!orgId) {
    return (
      <div className="w-full space-y-6" data-testid="subscription-page">
        <PageHeader
          leading={<CreditCard className="h-6 w-6 shrink-0 text-primary-text" />}
          title={t("title")}
          description={t("description")}
        />
        <EmptyState
          icon={CreditCard}
          title={t("noOrg")}
          hint={t("noOrgHint")}
          testId="subscription-no-org"
        />
      </div>
    );
  }

  const data = subscriptionQuery.data;
  const plan = data?.plan;
  const tone = plan ? planTone(plan.status) : "idle";

  return (
    <div className="w-full space-y-6" data-testid="subscription-page">
      <PageHeader
        leading={<CreditCard className="h-6 w-6 shrink-0 text-primary-text" />}
        title={t("title")}
        description={t("description")}
        actions={
          data ? (
            <Button type="button" onClick={scrollToPlans} data-testid="subscription-change-plan">
              {t("changePlan")}
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Button>
          ) : null
        }
      />

      {subscriptionQuery.isLoading ? (
        <div className="space-y-3" data-testid="subscription-loading">
          <Skeleton className="h-28 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ) : subscriptionQuery.isError || !data || !plan ? (
        <Alert variant="destructive" data-testid="subscription-error">
          <AlertTitle>{t("loadError")}</AlertTitle>
          <AlertDescription>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void subscriptionQuery.refetch()}
            >
              {t("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <WorkspaceShell
            tone={tone}
            wash={tone !== "idle"}
            testid="subscription-summary"
          >
            <WorkspaceShellHead
              icon={CreditCard}
              title={t("summaryTitle")}
              hint={data.organization_name}
              aside={
                <Badge
                  variant={planBadgeVariant(plan.status)}
                  data-status={plan.status}
                  className="text-[10px] uppercase"
                >
                  {t(`planStatus_${plan.status}`)}
                </Badge>
              }
            />
            <WorkspaceShellBody className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-foreground">
                    {plan.label}
                  </p>
                  <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
                    {plan.amount_idr != null
                      ? `${formatIdr(plan.amount_idr)}${plan.cycle === "annual" ? ` ${t("perYear")}` : ` ${t("perMonth")}`}`
                      : t("amountUnknown")}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {plan.period_start && plan.period_end ? (
                    <p>
                      {t("period", {
                        start: formatDate(plan.period_start, dateLocale),
                        end: formatDate(plan.period_end, dateLocale),
                      })}
                    </p>
                  ) : null}
                  {plan.renewal_at ? (
                    <p>{t("renewsOn", { date: formatDate(plan.renewal_at, dateLocale) })}</p>
                  ) : null}
                </div>
              </div>

              {data.pending_request ? (
                <WorkspaceNotice tone="warn" role="status">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t("pendingTitle")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("pendingBody", {
                          direction: data.pending_request.direction,
                          tier: tierLabel(data.pending_request.target_sku),
                          cycle: data.pending_request.cycle,
                        })}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 sm:min-h-10"
                      disabled={cancelMut.isPending}
                      onClick={() => cancelMut.mutate(data.pending_request!.id)}
                      data-testid="subscription-cancel-request"
                    >
                      {cancelMut.isPending ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : null}
                      {t("pendingCancel")}
                    </Button>
                  </div>
                </WorkspaceNotice>
              ) : null}
            </WorkspaceShellBody>
          </WorkspaceShell>

          <section className="space-y-3" aria-labelledby="subscription-usage-heading">
            <div className="space-y-1">
              <h3 id="subscription-usage-heading" className="text-sm font-medium tracking-wide text-foreground">
                {t("usageTitle")}
              </h3>
              <p className="text-xs text-muted-foreground">{t("usageDescription")}</p>
            </div>
            <StatGrid className="lg:grid-cols-5">
              {data.usage.map((item) => (
                <UsageTile key={item.product} item={item} />
              ))}
              <StatTile
                testid="subscription-usage-workspace"
                label={t("workspaceSeats")}
                value={
                  plan.sku === "enterprise"
                    ? t("workspaceSeatsCustom")
                    : data.workspace_seats.editor_limit != null ||
                        data.workspace_seats.viewer_limit != null
                      ? t("workspaceSeatsBasic", {
                          editors: data.workspace_seats.editors,
                          viewers: data.workspace_seats.viewers,
                        })
                      : t("workspaceSeatsValue", {
                          editors: data.workspace_seats.editors,
                          viewers: data.workspace_seats.viewers,
                        })
                }
              />
            </StatGrid>
          </section>

          <section id="subscription-plans" className="scroll-mt-6 space-y-3">
            <WorkspaceShell testid="subscription-plans">
              <WorkspaceShellHead
                icon={Gauge}
                title={t("plansTitle")}
                hint={t("plansDescription")}
                aside={
                  <Tabs
                    value={cycle}
                    onValueChange={(value) => setCycle(value as SubscriptionCycle)}
                  >
                    <TabsList variant="line" className="w-full justify-start">
                      <TabsTrigger value="monthly">{t("monthly")}</TabsTrigger>
                      <TabsTrigger value="annual">{t("annual")}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                }
              />
              <WorkspaceShellBody className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  {t("annualHint", {
                    paid: data.annual.months_paid,
                    served: data.annual.months_served,
                  })}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {TIERS.map((tier) => (
                    <PlanCard
                      key={tier}
                      overview={data}
                      tier={tier}
                      cycle={cycle}
                      canRequest={data.capabilities.can_request_change}
                      onRequest={setRequestTarget}
                    />
                  ))}
                  <Card className="flex h-full flex-col" data-testid="subscription-plan-enterprise">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-sm tracking-wide">
                        {t("enterpriseTitle")}
                      </CardTitle>
                      <p className="font-mono text-2xl font-semibold text-foreground">
                        {t("enterprisePrice")}
                      </p>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="text-xs text-muted-foreground">
                        {t("enterpriseHint")}
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => toast.info(t("contactSalesHint"))}
                        data-testid="subscription-contact-sales"
                      >
                        {t("contactSales")}
                      </Button>
                    </CardFooter>
                  </Card>
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium tracking-wide text-foreground">
                      {t("alacarteTitle")}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {t("alacarteDescription")}
                    </p>
                  </div>
                  <div className="overflow-hidden rounded-md border border-border">
                    <Table data-testid="subscription-alacarte-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] uppercase tracking-wider">
                            {t("colProduct")}
                          </TableHead>
                          <TableHead className="text-right text-[10px] uppercase tracking-wider">
                            {t("colBasic")}
                          </TableHead>
                          <TableHead className="text-right text-[10px] uppercase tracking-wider">
                            {t("colPro")}
                          </TableHead>
                          <TableHead className="text-right text-[10px] uppercase tracking-wider">
                            {t("colMulti")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {PRODUCTS.map((product) => {
                          const rows = data.catalog.filter((item) => item.service === product);
                          return (
                            <TableRow key={product}>
                              <TableCell className="text-sm text-foreground">
                                {t(`product_${product}`)}
                              </TableCell>
                              {TIERS.map((tier) => {
                                const item = rows.find((row) => row.sku === tier);
                                return (
                                  <TableCell
                                    key={tier}
                                    className="text-right font-mono text-xs tabular-nums text-foreground"
                                  >
                                    {item ? (
                                      <>
                                        <span className="block">{formatIdr(item.list_idr)}</span>
                                        <span className="block text-[10px] text-muted-foreground">
                                          {item.seats} {t("colSeats")}
                                        </span>
                                      </>
                                    ) : (
                                      "—"
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t("priceNote")}</p>
                </div>
              </WorkspaceShellBody>
            </WorkspaceShell>
          </section>

          <WorkspaceShell testid="subscription-invoices">
            <WorkspaceShellHead
              icon={Receipt}
              title={t("invoicesTitle")}
              hint={t("invoicesDescription")}
              aside={
                canManage ? (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="subscription-invoice-status" className="sr-only">
                      {t("invoiceFilter")}
                    </Label>
                    <Select value={invoiceStatus} onValueChange={setInvoiceStatus}>
                      <SelectTrigger
                        id="subscription-invoice-status"
                        className="h-10 min-h-10 w-40"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("invoiceAll")}</SelectItem>
                        <SelectItem value="draft">{t("invoiceStatus_draft")}</SelectItem>
                        <SelectItem value="sent">{t("invoiceStatus_sent")}</SelectItem>
                        <SelectItem value="paid">{t("invoiceStatus_paid")}</SelectItem>
                        <SelectItem value="void">{t("invoiceStatus_void")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null
              }
            />
            <WorkspaceShellBody className="space-y-3">
              {!canManage ? (
                <WorkspaceNotice tone="idle" role="status">
                  <p className="text-xs text-muted-foreground">{t("invoicesAdminOnly")}</p>
                </WorkspaceNotice>
              ) : invoicesQuery.isLoading ? (
                <div className="grid gap-3 lg:grid-cols-2" data-testid="subscription-invoices-loading">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="rounded-lg border border-border p-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="mt-2 h-3 w-48" />
                      <Skeleton className="mt-2 h-3 w-24" />
                    </div>
                  ))}
                </div>
              ) : invoicesQuery.isError ? (
                <WorkspaceNotice tone="idle" role="status">
                  <span data-testid="subscription-invoices-error">
                    {t("invoicesLoadError")}
                  </span>
                </WorkspaceNotice>
              ) : filteredInvoices.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title={t("invoicesEmpty")}
                  hint={t("invoicesEmptyHint")}
                  testId="subscription-invoices-empty"
                />
              ) : (
                <ul className="grid gap-3 lg:grid-cols-2" data-testid="subscription-invoices-list">
                  {filteredInvoices.map((invoice) => (
                    <WorkspaceInvoiceCard
                      key={invoice.id}
                      invoice={invoice}
                      onPrint={() => startPrint(invoice)}
                      onDownload={() => void downloadPdf(invoice)}
                    />
                  ))}
                </ul>
              )}
            </WorkspaceShellBody>
          </WorkspaceShell>

          <WorkspaceShell testid="subscription-faq">
            <WorkspaceShellHead
              icon={Landmark}
              title={t("faqTitle")}
              hint={t("description")}
            />
            <WorkspaceShellBody>
              <Accordion type="single" collapsible className="w-full">
                {[
                  ["seat", "faqSeatQ", "faqSeatA"],
                  ["change", "faqChangeQ", "faqChangeA"],
                  ["guard", "faqGuardQ", "faqGuardA"],
                  ["annual", "faqAnnualQ", "faqAnnualA"],
                  ["tax", "faqTaxQ", "faqTaxA"],
                  ["cancel", "faqCancelQ", "faqCancelA"],
                ].map(([value, question, answer]) => (
                  <AccordionItem key={value} value={value}>
                    <AccordionTrigger>{t(question)}</AccordionTrigger>
                    <AccordionContent>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {t(answer)}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </WorkspaceShellBody>
          </WorkspaceShell>
        </>
      )}

      <AlertDialog
        open={requestTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setRequestTarget(null);
            setRequestNote("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {requestTarget
                ? t("requestTitle", { tier: tierLabel(requestTarget) })
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("requestDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {cycle === "annual" ? t("requestCycleAnnual") : t("requestCycleMonthly")}
            </p>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="subscription-request-note">{t("requestNote")}</Label>
              <Textarea
                id="subscription-request-note"
                value={requestNote}
                maxLength={500}
                placeholder={t("requestNotePlaceholder")}
                onChange={(event) => setRequestNote(event.target.value)}
                data-testid="subscription-request-note"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={requestMut.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (requestTarget) requestMut.mutate(requestTarget);
              }}
              data-testid="subscription-request-submit"
            >
              {requestMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {t("requestSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InvoicePrintSheet invoice={printing} />
    </div>
  );
}

export default Subscription;
