import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Layers, MoreHorizontal, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  adminApi,
  createSkuTier,
  deactivateSkuTier,
  deleteSkuTier,
  getAdminSkuTiers,
  listAdminOrgs,
  reactivateSkuTier,
  updateSkuTier,
  type AdminOrgItem,
  type InvoiceProduct,
  type SkuTierMutationBody,
} from "@/api/admin";
import type { SkuTierInfo } from "@/api/subscription";
import {
  AdminNotice,
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { adminRailClass } from "@/components/admin/adminChrome";
import SkuTierHistorySheet, {
  type SkuTierHistoryScope,
} from "@/components/admin/SkuTierHistorySheet";
import { RAILED_CARD_CLASS } from "@/components/patterns/RailedShell";
import { SiemRail } from "@/components/siem/siemChrome";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
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
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/api/apiErrors";

const PRODUCTS: readonly InvoiceProduct[] = ["scan", "host", "uptime", "guard"];
const ORGS_PAGE_SIZE = 20;
const CODE_PATTERN = /^[a-z][a-z0-9_]{1,19}$/;
const EMPTY_TIER_SCOPE: SkuTierHistoryScope = {
  kind: "tier",
  code: "",
  label: "",
};

interface TierFormState {
  code: string;
  label: string;
  rank: string;
  active: boolean;
  requestable: boolean;
  sales_led: boolean;
  is_default: boolean;
  bundle_idr: string;
  limit_scan: string;
  limit_host: string;
  limit_uptime: string;
  limit_guard: string;
  allow_status_page: boolean;
  allow_custom_host: boolean;
  allow_waf_protect: boolean;
  allow_siem: boolean;
  billing_unrestricted: boolean;
  workspace_editor_limit: string;
  workspace_viewer_limit: string;
  prices: Record<InvoiceProduct, { list_idr: string; invoicable: boolean }>;
}


function usageTotal(tier: SkuTierInfo): number {
  const usage = tier.usage;
  if (!usage) return 0;
  return (
    usage.orgs +
    usage.subscriptions +
    usage.invoices +
    usage.requests +
    usage.promos
  );
}

function emptyPrices(): TierFormState["prices"] {
  return {
    scan: { list_idr: "", invoicable: true },
    host: { list_idr: "", invoicable: true },
    uptime: { list_idr: "", invoicable: true },
    guard: { list_idr: "", invoicable: true },
  };
}

function emptyForm(): TierFormState {
  return {
    code: "",
    label: "",
    rank: "",
    active: true,
    requestable: true,
    sales_led: false,
    is_default: false,
    bundle_idr: "",
    limit_scan: "1",
    limit_host: "1",
    limit_uptime: "10",
    limit_guard: "1",
    allow_status_page: false,
    allow_custom_host: false,
    allow_waf_protect: false,
    allow_siem: false,
    billing_unrestricted: false,
    workspace_editor_limit: "",
    workspace_viewer_limit: "",
    prices: emptyPrices(),
  };
}

function formFromTier(
  tier: SkuTierInfo,
  catalog: { product: InvoiceProduct; sku: string; list_idr: number; invoicable: boolean }[],
): TierFormState {
  const base = emptyForm();
  const prices = emptyPrices();
  for (const product of PRODUCTS) {
    const row = catalog.find(
      (item) => item.sku === tier.code && item.product === product,
    );
    if (row) {
      prices[product] = {
        list_idr: String(row.list_idr),
        invoicable: row.invoicable,
      };
    }
  }
  return {
    ...base,
    code: tier.code,
    label: tier.label,
    rank: String(tier.rank),
    active: tier.active,
    requestable: tier.requestable,
    sales_led: tier.sales_led,
    is_default: tier.is_default,
    bundle_idr: tier.bundle_idr == null ? "" : String(tier.bundle_idr),
    limit_scan: String(tier.limits.scan),
    limit_host: String(tier.limits.host),
    limit_uptime: String(tier.limits.uptime),
    limit_guard: String(tier.limits.guard),
    allow_status_page: tier.features.allow_status_page,
    allow_custom_host: tier.features.allow_custom_host,
    allow_waf_protect: tier.features.allow_waf_protect,
    allow_siem: tier.features.allow_siem,
    billing_unrestricted: tier.features.billing_unrestricted,
    workspace_editor_limit:
      tier.workspace_limits.editor == null
        ? ""
        : String(tier.workspace_limits.editor),
    workspace_viewer_limit:
      tier.workspace_limits.viewer == null
        ? ""
        : String(tier.workspace_limits.viewer),
    prices,
  };
}

function parseOptional(raw: string, min: number): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < min) return undefined;
  return value;
}

function limitValue(raw: string): number | undefined {
  const parsed = parseOptional(raw, 1);
  return typeof parsed === "number" ? parsed : undefined;
}

function ToggleField({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label htmlFor={id} className="cursor-pointer">
        {label}
      </Label>
    </div>
  );
}

function TierActionsMenu({
  tier,
  desktop,
  used,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
  onHistory,
}: {
  readonly tier: SkuTierInfo;
  readonly desktop: boolean;
  readonly used: boolean;
  readonly onEdit: (tier: SkuTierInfo) => void;
  readonly onDeactivate: (tier: SkuTierInfo) => void;
  readonly onReactivate: (tier: SkuTierInfo) => void;
  readonly onDelete: (tier: SkuTierInfo) => void;
  readonly onHistory: (tier: SkuTierInfo) => void;
}) {
  const { t } = useTranslation("admin");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "p-0",
            desktop
              ? "h-9 w-9 min-h-9 min-w-9"
              : "h-11 w-11 min-h-11 min-w-11",
          )}
          data-testid={
            desktop
              ? `sku-tier-actions-${tier.code}`
              : `sku-tier-actions-mobile-${tier.code}`
          }
          aria-label={t("tierActionMenu")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          data-testid={`sku-tier-edit-${tier.code}`}
          onSelect={() => onEdit(tier)}
        >
          {t("tierActionEdit")}
        </DropdownMenuItem>
        {tier.active ? (
          <DropdownMenuItem
            data-testid={`sku-tier-deactivate-${tier.code}`}
            onSelect={() => onDeactivate(tier)}
          >
            {t("tierActionDeactivate")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            data-testid={`sku-tier-reactivate-${tier.code}`}
            onSelect={() => onReactivate(tier)}
          >
            {t("tierActionReactivate")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          data-testid={`sku-tier-history-${tier.code}`}
          onSelect={() => onHistory(tier)}
        >
          {t("tierActionHistory")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={used}
          title={used ? t("tierDeleteUsedHint") : undefined}
          data-testid={`sku-tier-delete-${tier.code}`}
          onSelect={() => {
            if (!used) onDelete(tier);
          }}
        >
          {t("tierActionDelete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function featureSummary(tier: SkuTierInfo, t: (key: string) => string): string {
  const labels: string[] = [];
  if (tier.features.allow_status_page) labels.push(t("tierFeatureStatusShort"));
  if (tier.features.allow_custom_host) labels.push(t("tierFeatureHostShort"));
  if (tier.features.allow_waf_protect) labels.push(t("tierFeatureWafShort"));
  if (tier.features.allow_siem) labels.push(t("tierFeatureSiemShort"));
  return labels.length > 0 ? labels.join(" · ") : "—";
}

function TierCells({
  tier,
  desktop,
  used,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
  onHistory,
  onOrgs,
}: {
  readonly tier: SkuTierInfo;
  readonly desktop: boolean;
  readonly used: boolean;
  readonly onEdit: (tier: SkuTierInfo) => void;
  readonly onDeactivate: (tier: SkuTierInfo) => void;
  readonly onReactivate: (tier: SkuTierInfo) => void;
  readonly onDelete: (tier: SkuTierInfo) => void;
  readonly onHistory: (tier: SkuTierInfo) => void;
  readonly onOrgs: (tier: SkuTierInfo) => void;
}) {
  const { t } = useTranslation("admin");
  const action = (
    <div className="flex justify-end">
      <TierActionsMenu
        tier={tier}
        desktop={desktop}
        used={used}
        onEdit={onEdit}
        onDeactivate={onDeactivate}
        onReactivate={onReactivate}
        onDelete={onDelete}
        onHistory={onHistory}
      />
    </div>
  );

  const counts = tier.usage
    ? `${tier.usage.orgs}/${tier.usage.subscriptions}/${tier.usage.invoices}/${tier.usage.requests}/${tier.usage.promos}`
    : "—";

  if (!desktop) {
    return (
      <div
        className={RAILED_CARD_CLASS}
        data-testid={`sku-tier-card-${tier.code}`}
      >
        <SiemRail className={adminRailClass(tier.active ? "primary" : "idle")} />
        <div className="space-y-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {tier.label}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {tier.code}
              </p>
            </div>
            <Badge
              variant={tier.active ? "success" : "default"}
              className="shrink-0 text-[10px] uppercase"
            >
              {tier.active ? t("tierStatusActive") : t("tierStatusRetired")}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("tierRankLabel")}: {tier.rank} ·{" "}
            {t("tierLimitCell", {
              scan: tier.limits.scan,
              host: tier.limits.host,
              uptime: tier.limits.uptime,
              guard: tier.limits.guard,
            })}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {featureSummary(tier, t)}
          </p>
          {tier.usage && tier.usage.orgs > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-1 font-mono text-[11px] tabular-nums"
              data-testid={`sku-tier-orgs-mobile-${tier.code}`}
              onClick={() => onOrgs(tier)}
            >
              {t("tierUsageCell", {
                orgs: tier.usage.orgs,
                subscriptions: tier.usage.subscriptions,
                invoices: tier.usage.invoices,
                requests: tier.usage.requests,
                promos: tier.usage.promos,
              })}
            </Button>
          ) : (
            <p className="font-mono text-[11px] text-muted-foreground">
              {counts}
            </p>
          )}
          <div className="flex justify-end pt-1">{action}</div>
        </div>
      </div>
    );
  }

  return (
    <TableRow
      data-testid={`sku-tier-row-${tier.code}`}
      className="hover:bg-muted/50"
    >
      <TableCell className="py-2">
        <p className="text-sm text-foreground">{tier.label}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {tier.code}
        </p>
      </TableCell>
      <TableCell className="py-2 font-mono text-xs tabular-nums">
        {tier.rank}
      </TableCell>
      <TableCell className="py-2">
        <Badge
          variant={tier.active ? "success" : "default"}
          className="text-[10px] uppercase"
        >
          {tier.active ? t("tierStatusActive") : t("tierStatusRetired")}
        </Badge>
      </TableCell>
      <TableCell className="py-2 font-mono text-xs tabular-nums">
        {tier.limits.scan}/{tier.limits.host}/{tier.limits.uptime}/
        {tier.limits.guard}
      </TableCell>
      <TableCell className="py-2 text-xs text-muted-foreground">
        {featureSummary(tier, t)}
      </TableCell>
      <TableCell className="py-2 font-mono text-xs tabular-nums text-muted-foreground">
        {tier.usage && tier.usage.orgs > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1 font-mono text-xs tabular-nums"
            data-testid={`sku-tier-orgs-${tier.code}`}
            onClick={() => onOrgs(tier)}
          >
            {counts}
          </Button>
        ) : (
          counts
        )}
      </TableCell>
      <TableCell className="py-2 text-right">{action}</TableCell>
    </TableRow>
  );
}

export default function AdminSkuTierPanel() {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<SkuTierInfo | null>(null);
  const [form, setForm] = useState<TierFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SkuTierInfo | null>(null);
  const [historyScope, setHistoryScope] = useState<SkuTierHistoryScope | null>(
    null,
  );
  const [historyPage, setHistoryPage] = useState(1);
  const [orgsTarget, setOrgsTarget] = useState<SkuTierInfo | null>(null);
  const [orgsPage, setOrgsPage] = useState(1);

  const tiersQ = useQuery({
    queryKey: ["admin-sku-tiers"],
    queryFn: getAdminSkuTiers,
  });
  const catalogQ = useQuery({
    queryKey: ["admin-sku-catalog"],
    queryFn: adminApi.getSkuCatalog,
  });
  const orgsCode = orgsTarget?.code ?? "";
  const orgsQ = useQuery({
    queryKey: ["admin-orgs", orgsCode, orgsPage],
    queryFn: () =>
      listAdminOrgs({ sku: orgsCode, page: orgsPage, page_size: ORGS_PAGE_SIZE }),
    enabled: orgsTarget != null,
  });

  useEffect(() => {
    if (orgsQ.isError) {
      toast.error(apiErrorMessage(orgsQ.error, t("tierOrgsError")));
    }
  }, [orgsQ.isError, orgsQ.error, t]);

  const tiers = tiersQ.data ?? [];
  const catalog = catalogQ.data ?? [];
  const orgsItems = orgsQ.data?.items ?? [];
  const orgsTotal = orgsQ.data?.total ?? 0;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-sku-tiers"] });
    void qc.invalidateQueries({ queryKey: ["sku-tiers"] });
    void qc.invalidateQueries({ queryKey: ["admin-sku-catalog"] });
    void qc.invalidateQueries({ queryKey: ["admin-sku-pricing"] });
    void qc.invalidateQueries({ queryKey: ["org-subscription"] });
    void qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
  };

  const saveMut = useMutation({
    mutationFn: (body: SkuTierMutationBody) =>
      editing ? updateSkuTier(editing.code, body) : createSkuTier(body),
    onSuccess: () => {
      toast.success(editing ? t("tierUpdated") : t("tierCreated"));
      setForm(null);
      setEditing(null);
      invalidate();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, t("tierMutationFail"))),
  });

  const deactivateMut = useMutation({
    mutationFn: (code: string) => deactivateSkuTier(code),
    onSuccess: () => {
      toast.success(t("tierDeactivated"));
      invalidate();
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, t("tierMutationFail"))),
  });

  const reactivateMut = useMutation({
    mutationFn: (code: string) => reactivateSkuTier(code),
    onSuccess: () => {
      toast.success(t("tierReactivated"));
      invalidate();
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, t("tierMutationFail"))),
  });

  const deleteMut = useMutation({
    mutationFn: (code: string) => deleteSkuTier(code),
    onSuccess: () => {
      toast.success(t("tierDeleted"));
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, t("tierMutationFail")));
      setDeleteTarget(null);
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
  }

  function openEdit(tier: SkuTierInfo) {
    setEditing(tier);
    setForm(formFromTier(tier, catalog));
  }

  function openHistory(tier: SkuTierInfo) {
    setHistoryScope({ kind: "tier", code: tier.code, label: tier.label });
    setHistoryPage(1);
  }

  function openOrgHistory(org: AdminOrgItem) {
    setOrgsTarget(null);
    setHistoryScope({ kind: "org", orgId: org.id, label: org.name });
    setHistoryPage(1);
  }

  function openOrgs(tier: SkuTierInfo) {
    setOrgsTarget(tier);
    setOrgsPage(1);
  }

  function patch(patchValue: Partial<TierFormState>) {
    setForm((prev) => (prev ? { ...prev, ...patchValue } : prev));
  }

  function patchPrice(
    product: InvoiceProduct,
    patchValue: Partial<TierFormState["prices"][InvoiceProduct]>,
  ) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            prices: {
              ...prev.prices,
              [product]: { ...prev.prices[product], ...patchValue },
            },
          }
        : prev,
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    const label = form.label.trim();
    if (!label) {
      toast.error(t("tierValidationLabel"));
      return;
    }
    if (!editing && !CODE_PATTERN.test(form.code.trim())) {
      toast.error(t("tierValidationCode"));
      return;
    }
    const scan = limitValue(form.limit_scan);
    const host = limitValue(form.limit_host);
    const uptime = limitValue(form.limit_uptime);
    const guard = limitValue(form.limit_guard);
    if (scan == null || host == null || uptime == null || guard == null) {
      toast.error(t("tierValidationLimit"));
      return;
    }
    const rank = parseOptional(form.rank, 1);
    if (rank === undefined) {
      toast.error(t("tierValidationRank"));
      return;
    }
    const bundle = parseOptional(form.bundle_idr, 0);
    if (bundle === undefined) {
      toast.error(t("tierValidationBundle"));
      return;
    }
    const editor = parseOptional(form.workspace_editor_limit, 1);
    const viewer = parseOptional(form.workspace_viewer_limit, 1);
    if (editor === undefined || viewer === undefined) {
      toast.error(t("tierValidationWorkspace"));
      return;
    }

    let prices: SkuTierMutationBody["prices"];
    if (!form.sales_led) {
      prices = {};
      for (const product of PRODUCTS) {
        const parsed = parseOptional(form.prices[product].list_idr, 0);
        if (typeof parsed !== "number") {
          toast.error(t("tierValidationPrices"));
          return;
        }
        prices[product] = {
          list_idr: parsed,
          invoicable: form.prices[product].invoicable,
        };
      }
    }

    const body: SkuTierMutationBody = {
      label,
      rank: typeof rank === "number" ? rank : undefined,
      active: form.active,
      requestable: form.sales_led ? false : form.requestable,
      sales_led: form.sales_led,
      is_default: form.is_default,
      bundle_idr: bundle,
      limit_scan: scan,
      limit_host: host,
      limit_uptime: uptime,
      limit_guard: guard,
      allow_status_page: form.allow_status_page,
      allow_custom_host: form.allow_custom_host,
      allow_waf_protect: form.allow_waf_protect,
      allow_siem: form.sales_led ? true : form.allow_siem,
      billing_unrestricted: form.sales_led
        ? true
        : form.billing_unrestricted,
      workspace_editor_limit: editor,
      workspace_viewer_limit: viewer,
      prices,
    };
    if (!editing) body.code = form.code.trim();
    saveMut.mutate(body);
  }

  return (
    <div className="w-full space-y-4">
      <AdminShell tone="info" testid="sku-tier-guide">
        <AdminShellHead
          icon={Info}
          title={t("tierGuideTitle")}
          hint={t("tierGuideHint")}
        />
        <AdminShellBody>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="steps">
              <AccordionTrigger>{t("tierGuideStepsTitle")}</AccordionTrigger>
              <AccordionContent>
                <ol className="ml-4 list-decimal space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("tierGuideStep1")}</li>
                  <li>{t("tierGuideStep2")}</li>
                  <li>{t("tierGuideStep3")}</li>
                  <li>{t("tierGuideStep4")}</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="about">
              <AccordionTrigger>{t("tierGuideAboutTitle")}</AccordionTrigger>
              <AccordionContent>
                <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
                  {t("tierGuideBody")}
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </AdminShellBody>
      </AdminShell>

      <AdminShell testid="sku-tier-card">
        <AdminShellHead
          icon={Layers}
          title={t("tierPanelTitle")}
          hint={t("tierPanelHint")}
          aside={
            <Button
              type="button"
              size="sm"
              onClick={openCreate}
              data-testid="sku-tier-create"
              className="min-h-11 sm:min-h-9"
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              {t("tierCreate")}
            </Button>
          }
        />
        <AdminShellBody className="space-y-3">
          <AdminNotice tone="info" role="status">
            {t("tierGuideNotice")}
          </AdminNotice>
          {tiersQ.isLoading ? (
            <p className="text-xs text-muted-foreground">{t("tierLoading")}</p>
          ) : tiersQ.isError ? (
            <p className="text-xs text-muted-foreground" data-testid="sku-tier-error">
              {t("tierLoadError")}
            </p>
          ) : (
            <>
              <div className="space-y-2 md:hidden" data-testid="sku-tier-mobile">
                {tiers.map((tier) => (
                  <TierCells
                    key={tier.code}
                    tier={tier}
                    desktop={false}
                    used={usageTotal(tier) > 0}
                    onEdit={openEdit}
                    onDeactivate={(row) => deactivateMut.mutate(row.code)}
                    onReactivate={(row) => reactivateMut.mutate(row.code)}
                    onDelete={setDeleteTarget}
                    onHistory={openHistory}
                    onOrgs={openOrgs}
                  />
                ))}
              </div>
              <div
                className="hidden overflow-hidden rounded-md border border-border md:block"
                data-testid="sku-tier-desktop"
              >
                <Table data-testid="sku-tier-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                        {t("tierColTier")}
                      </TableHead>
                      <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                        {t("tierColRank")}
                      </TableHead>
                      <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                        {t("tierColStatus")}
                      </TableHead>
                      <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                        {t("tierColLimit")}
                      </TableHead>
                      <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                        {t("tierColFeatures")}
                      </TableHead>
                      <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                        {t("tierColUsage")}
                      </TableHead>
                      <TableHead className="py-2 text-right text-[10px] uppercase tracking-wider">
                        {t("tierColActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tiers.map((tier) => (
                      <TierCells
                        key={tier.code}
                        tier={tier}
                        desktop
                        used={usageTotal(tier) > 0}
                        onEdit={openEdit}
                        onDeactivate={(row) => deactivateMut.mutate(row.code)}
                        onReactivate={(row) => reactivateMut.mutate(row.code)}
                        onDelete={setDeleteTarget}
                        onHistory={openHistory}
                        onOrgs={openOrgs}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </AdminShellBody>
      </AdminShell>

      <Sheet
        open={form != null}
        onOpenChange={(open) => {
          if (!open) {
            setForm(null);
            setEditing(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg"
          data-testid="sku-tier-form"
        >
          <SheetHeader>
            <SheetTitle>
              {editing
                ? t("tierEditTitle", { label: editing.label })
                : t("tierCreateTitle")}
            </SheetTitle>
            <SheetDescription>{t("tierFormHint")}</SheetDescription>
          </SheetHeader>
          {form ? (
            <form className="space-y-4 px-4 pb-4" onSubmit={submit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="tier-code">{t("tierFieldCode")}</Label>
                  <Input
                    id="tier-code"
                    value={form.code}
                    disabled={editing != null}
                    pattern="^[a-z][a-z0-9_]{1,19}$"
                    onChange={(event) => patch({ code: event.target.value })}
                    placeholder="pro_plus"
                    className="h-10 min-h-10 font-mono text-xs"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="tier-label">{t("tierFieldLabel")}</Label>
                  <Input
                    id="tier-label"
                    value={form.label}
                    maxLength={60}
                    onChange={(event) => patch({ label: event.target.value })}
                    placeholder="Pro+"
                    className="h-10 min-h-10"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="tier-rank">{t("tierFieldRank")}</Label>
                  <Input
                    id="tier-rank"
                    inputMode="numeric"
                    value={form.rank}
                    onChange={(event) => patch({ rank: event.target.value })}
                    placeholder={t("tierFieldRankPlaceholder")}
                    className="h-10 min-h-10 font-mono text-xs"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="tier-bundle">{t("tierFieldBundle")}</Label>
                  <Input
                    id="tier-bundle"
                    inputMode="numeric"
                    value={form.bundle_idr}
                    onChange={(event) =>
                      patch({ bundle_idr: event.target.value })
                    }
                    placeholder="0"
                    className="h-10 min-h-10 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <ToggleField
                  id="tier-active"
                  label={t("tierFieldActive")}
                  checked={form.active}
                  onChange={(active) => patch({ active })}
                />
                <ToggleField
                  id="tier-requestable"
                  label={t("tierFieldRequestable")}
                  checked={form.requestable}
                  disabled={form.sales_led}
                  onChange={(requestable) => patch({ requestable })}
                />
                <ToggleField
                  id="tier-sales-led"
                  label={t("tierFieldSalesLed")}
                  checked={form.sales_led}
                  onChange={(salesLed) =>
                    patch({
                      sales_led: salesLed,
                      requestable: salesLed ? false : form.requestable,
                      allow_siem: salesLed ? true : form.allow_siem,
                      billing_unrestricted: salesLed
                        ? true
                        : form.billing_unrestricted,
                    })
                  }
                />
                <ToggleField
                  id="tier-default"
                  label={t("tierFieldDefault")}
                  checked={form.is_default}
                  onChange={(isDefault) => patch({ is_default: isDefault })}
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-muted-foreground">
                  {t("tierSectionLimits")}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["scan", "limit_scan"],
                      ["host", "limit_host"],
                      ["uptime", "limit_uptime"],
                      ["guard", "limit_guard"],
                    ] as const
                  ).map(([product, key]) => (
                    <div key={key} className="flex min-w-0 flex-col gap-1.5">
                      <Label htmlFor={`tier-${key}`}>
                        {t(`tierFieldLimit_${product}`)}
                      </Label>
                      <Input
                        id={`tier-${key}`}
                        inputMode="numeric"
                        value={form[key]}
                        onChange={(event) => patch({ [key]: event.target.value })}
                        className="h-10 min-h-10 font-mono text-xs"
                      />
                    </div>
                  ))}
                </div>
              </fieldset>

              {!form.sales_led ? (
                <fieldset className="space-y-2" data-testid="tier-prices">
                  <legend className="text-xs font-medium text-muted-foreground">
                    {t("tierSectionPrices")}
                  </legend>
                  <div className="space-y-2">
                    {PRODUCTS.map((product) => (
                      <div
                        key={product}
                        className="grid items-end gap-2 sm:grid-cols-[1fr_auto]"
                      >
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Label htmlFor={`tier-price-${product}`}>
                            {t(`tierFieldPrice_${product}`)}
                          </Label>
                          <Input
                            id={`tier-price-${product}`}
                            inputMode="numeric"
                            value={form.prices[product].list_idr}
                            onChange={(event) =>
                              patchPrice(product, {
                                list_idr: event.target.value,
                              })
                            }
                            className="h-10 min-h-10 font-mono text-xs"
                          />
                        </div>
                        <ToggleField
                          id={`tier-invoicable-${product}`}
                          label={t("tierFieldInvoicable")}
                          checked={form.prices[product].invoicable}
                          onChange={(invoicable) =>
                            patchPrice(product, { invoicable })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-muted-foreground">
                  {t("tierSectionFeatures")}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ToggleField
                    id="tier-status-page"
                    label={t("tierFeatureStatusPage")}
                    checked={form.allow_status_page}
                    onChange={(allowStatusPage) =>
                      patch({ allow_status_page: allowStatusPage })
                    }
                  />
                  <ToggleField
                    id="tier-custom-host"
                    label={t("tierFeatureCustomHost")}
                    checked={form.allow_custom_host}
                    onChange={(allowCustomHost) =>
                      patch({ allow_custom_host: allowCustomHost })
                    }
                  />
                  <ToggleField
                    id="tier-waf"
                    label={t("tierFeatureWaf")}
                    checked={form.allow_waf_protect}
                    onChange={(allowWaf) =>
                      patch({ allow_waf_protect: allowWaf })
                    }
                  />
                  <ToggleField
                    id="tier-siem"
                    label={t("tierFeatureSiem")}
                    checked={form.allow_siem}
                    disabled={form.sales_led}
                    onChange={(allowSiem) => patch({ allow_siem: allowSiem })}
                  />
                  <ToggleField
                    id="tier-billing"
                    label={t("tierFeatureBilling")}
                    checked={form.billing_unrestricted}
                    disabled={form.sales_led}
                    onChange={(billing) =>
                      patch({ billing_unrestricted: billing })
                    }
                  />
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-muted-foreground">
                  {t("tierSectionWorkspace")}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="tier-editor-limit">
                      {t("tierFieldWorkspaceEditor")}
                    </Label>
                    <Input
                      id="tier-editor-limit"
                      inputMode="numeric"
                      value={form.workspace_editor_limit}
                      onChange={(event) =>
                        patch({ workspace_editor_limit: event.target.value })
                      }
                      placeholder={t("tierFieldWorkspaceUnlimited")}
                      className="h-10 min-h-10 font-mono text-xs"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="tier-viewer-limit">
                      {t("tierFieldWorkspaceViewer")}
                    </Label>
                    <Input
                      id="tier-viewer-limit"
                      inputMode="numeric"
                      value={form.workspace_viewer_limit}
                      onChange={(event) =>
                        patch({ workspace_viewer_limit: event.target.value })
                      }
                      placeholder={t("tierFieldWorkspaceUnlimited")}
                      className="h-10 min-h-10 font-mono text-xs"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("tierFieldWorkspaceHint")}
                </p>
              </fieldset>

              <SheetFooter className="px-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setForm(null);
                    setEditing(null);
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={saveMut.isPending}
                  data-testid="sku-tier-save"
                >
                  {t("tierSave")}
                </Button>
              </SheetFooter>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tierDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tierDeleteBody", { label: deleteTarget?.label ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              data-testid="sku-tier-delete-confirm"
              disabled={deleteMut.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMut.mutate(deleteTarget.code);
              }}
            >
              {t("tierDeleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SkuTierHistorySheet
        open={historyScope != null}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryScope(null);
            setHistoryPage(1);
          }
        }}
        scope={historyScope ?? EMPTY_TIER_SCOPE}
        page={historyPage}
        onPageChange={setHistoryPage}
      />

      <Sheet
        open={orgsTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setOrgsTarget(null);
            setOrgsPage(1);
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg"
          data-testid="sku-tier-orgs-dialog"
        >
          <SheetHeader>
            <SheetTitle>
              {t("tierOrgsTitle", { label: orgsTarget?.label ?? "" })}
            </SheetTitle>
            <SheetDescription>{t("tierOrgsDescription")}</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-4">
            {orgsQ.isLoading ? (
              <p className="text-xs text-muted-foreground">
                {t("tierOrgsLoading")}
              </p>
            ) : orgsItems.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {t("tierOrgsTotal", { total: orgsTotal })}
                </p>
                <ul className="space-y-2">
                  {orgsItems.map((org) => (
                    <li
                      key={org.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                      data-testid="sku-tier-org-entry"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">
                          {org.name}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {org.slug}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        data-testid={`sku-org-history-${org.id}`}
                        onClick={() => openOrgHistory(org)}
                      >
                        {t("tierHistoryAction")}
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="sku-tier-orgs-prev"
                    disabled={orgsPage <= 1}
                    onClick={() => setOrgsPage((page) => Math.max(1, page - 1))}
                  >
                    {t("tierHistoryPrev")}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    {t("tierHistoryPage", {
                      page: orgsPage,
                      pages: Math.max(
                        1,
                        Math.ceil(orgsTotal / ORGS_PAGE_SIZE),
                      ),
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="sku-tier-orgs-next"
                    disabled={
                      orgsPage >=
                      Math.max(1, Math.ceil(orgsTotal / ORGS_PAGE_SIZE))
                    }
                    onClick={() => setOrgsPage((page) => page + 1)}
                  >
                    {t("tierHistoryNext")}
                  </Button>
                </div>
              </>
            ) : (
              <p
                className="text-xs text-muted-foreground"
                data-testid="sku-tier-orgs-empty"
              >
                {t("tierOrgsEmpty")}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
