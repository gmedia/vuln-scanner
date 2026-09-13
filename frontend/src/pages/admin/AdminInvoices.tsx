import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import PageHeader from "@/components/layout/PageHeader";
import { adminApi, type InvoiceItem } from "@/api/admin";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function formatIdr(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function AdminInvoices() {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [orgId, setOrgId] = useState("");
  const [sku, setSku] = useState("basic");
  const [bankRef, setBankRef] = useState("");

  const catalogQ = useQuery({
    queryKey: ["admin-sku-catalog"],
    queryFn: adminApi.getSkuCatalog,
  });
  const orgsQ = useQuery({
    queryKey: ["admin-orgs"],
    queryFn: () => adminApi.listAdminOrgs(),
  });
  const invoicesQ = useQuery({
    queryKey: ["admin-invoices", status],
    queryFn: () =>
      adminApi.listAdminInvoices({
        status: status === "all" ? undefined : status,
      }),
  });

  const createMut = useMutation({
    mutationFn: () =>
      adminApi.createAdminInvoice({ organization_id: orgId, sku }),
    onSuccess: () => {
      toast.success(t("invoiceCreated"));
      void qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: () => toast.error(t("invoiceCreateFail")),
  });
  const sendMut = useMutation({
    mutationFn: (id: string) => adminApi.sendAdminInvoice(id),
    onSuccess: () => {
      toast.success(t("invoiceSent"));
      void qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
  });
  const payMut = useMutation({
    mutationFn: (id: string) => adminApi.payAdminInvoice(id, bankRef || undefined),
    onSuccess: () => {
      toast.success(t("invoicePaid"));
      setBankRef("");
      void qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
  });
  const voidMut = useMutation({
    mutationFn: (id: string) => adminApi.voidAdminInvoice(id),
    onSuccess: () => {
      toast.success(t("invoiceVoided"));
      void qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
  });

  const catalog = catalogQ.data ?? [];
  const orgs = orgsQ.data?.items ?? [];
  const invoices = invoicesQ.data?.items ?? [];

  return (
    <div className="w-full space-y-6" data-testid="admin-invoices-page">
      <PageHeader
        leading={<Receipt className="h-6 w-6 shrink-0 text-primary" />}
        title={t("invoicesTitle")}
      />

      <Alert>
        <AlertTitle>{t("invoicesBannerTitle")}</AlertTitle>
        <AlertDescription>{t("invoicesBannerBody")}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            {t("skuCatalogCard")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {catalogQ.isLoading ? (
            <TableRowSkeleton rows={3} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colProduct")}</TableHead>
                  <TableHead>{t("colSku")}</TableHead>
                  <TableHead>{t("colListIdr")}</TableHead>
                  <TableHead>{t("colSeats")}</TableHead>
                  <TableHead>{t("colInvoicable")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.map((row) => (
                  <TableRow key={`${row.product}-${row.sku}`}>
                    <TableCell>{row.product}</TableCell>
                    <TableCell className="uppercase">{row.sku}</TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {formatIdr(row.list_idr)}
                    </TableCell>
                    <TableCell>{row.seats}</TableCell>
                    <TableCell>{row.invoicable ? t("yes") : t("no")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            {t("invoiceCreateCard")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="inv-org">{t("colOrg")}</Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger id="inv-org" className="h-10 min-h-10">
                  <SelectValue placeholder={t("pickOrg")} />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} ({o.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="inv-sku">{t("colSku")}</Label>
              <Select value={sku} onValueChange={setSku}>
                <SelectTrigger id="inv-sku" className="h-10 min-h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="multi">Multi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                data-testid="invoice-create"
                disabled={!orgId || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("invoiceCreate")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            {t("invoiceListCard")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="inv-status">{t("colStatus")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="inv-status" className="h-10 min-h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("statusAll")}</SelectItem>
                  <SelectItem value="draft">draft</SelectItem>
                  <SelectItem value="sent">sent</SelectItem>
                  <SelectItem value="paid">paid</SelectItem>
                  <SelectItem value="void">void</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="inv-bank-ref">{t("colBankRef")}</Label>
              <Input
                id="inv-bank-ref"
                className="h-10 min-h-10"
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value)}
                placeholder="TF-…"
              />
            </div>
          </div>
          {invoicesQ.isLoading ? (
            <TableRowSkeleton rows={4} />
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("invoicesEmpty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colNumber")}</TableHead>
                  <TableHead>{t("colOrg")}</TableHead>
                  <TableHead>{t("colSku")}</TableHead>
                  <TableHead>{t("colListIdr")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv: InvoiceItem) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                    <TableCell>{inv.organization_name ?? "—"}</TableCell>
                    <TableCell className="uppercase">{inv.sku}</TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {formatIdr(inv.amount_idr)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">{inv.status}</Badge>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      {inv.status === "draft" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`invoice-send-${inv.id}`}
                          onClick={() => sendMut.mutate(inv.id)}
                        >
                          {t("invoiceSend")}
                        </Button>
                      ) : null}
                      {inv.status === "draft" || inv.status === "sent" ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            data-testid={`invoice-paid-${inv.id}`}
                            onClick={() => payMut.mutate(inv.id)}
                          >
                            {t("invoiceMarkPaid")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            data-testid={`invoice-void-${inv.id}`}
                            onClick={() => voidMut.mutate(inv.id)}
                          >
                            {t("invoiceVoid")}
                          </Button>
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminInvoices;
