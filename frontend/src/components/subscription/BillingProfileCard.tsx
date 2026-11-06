import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { FormAlert, FieldError } from "@/components/patterns/FormFeedback";
import { useApiFormErrors } from "@/hooks/useApiFormErrors";
import { apiErrorMessage, apiFieldErrors } from "@/api/apiErrors";
import {
  WorkspaceShell,
  WorkspaceShellBody,
  WorkspaceShellHead,
} from "@/components/workspace/WorkspaceShell";
import {
  addBillingRecipient,
  getBillingProfile,
  removeBillingRecipient,
  saveBillingProfile,
  type BillingProfile,
  type BillingProfileUpdate,
} from "@/api/billingProfile";

const TERMS = [0, 14, 30, 45];

function toForm(profile: BillingProfile): BillingProfileUpdate {
  return {
    legal_name: profile.legal_name,
    tax_id: profile.tax_id,
    nitku: profile.nitku,
    address_line1: profile.address_line1,
    address_line2: profile.address_line2,
    city: profile.city,
    province: profile.province,
    postal_code: profile.postal_code,
    country: profile.country,
    billing_email: profile.billing_email,
    po_required: profile.po_required,
    po_number: profile.po_number,
    payment_terms_days: profile.payment_terms_days,
    pkp_status: profile.pkp_status,
  };
}

function BillingProfileForm({
  orgId,
  profile,
}: {
  readonly orgId: string;
  readonly profile: BillingProfile;
}) {
  const { t } = useTranslation("subscription");
  const qc = useQueryClient();
  const formErrors = useApiFormErrors();
  const [form, setForm] = useState<BillingProfileUpdate>(() => toForm(profile));
  const [recipientEmail, setRecipientEmail] = useState("");

  const saveMut = useMutation({
    mutationFn: (body: BillingProfileUpdate) => saveBillingProfile(orgId, body),
    onSuccess: () => {
      formErrors.clear();
      toast.success(t("billingSaved"));
      void qc.invalidateQueries({ queryKey: ["billing-profile", orgId] });
    },
    onError: (err: unknown) => {
      formErrors.setFormError(apiErrorMessage(err, t("billingSaveFail")));
      formErrors.setFieldErrors(apiFieldErrors(err));
    },
  });

  const addMut = useMutation({
    mutationFn: (email: string) => addBillingRecipient(orgId, { email }),
    onSuccess: () => {
      toast.success(t("recipientAdded"));
      setRecipientEmail("");
      formErrors.clearField("email");
      void qc.invalidateQueries({ queryKey: ["billing-profile", orgId] });
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, t("recipientAddFail")));
      formErrors.setFieldErrors(apiFieldErrors(err));
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => removeBillingRecipient(orgId, id),
    onSuccess: () => {
      toast.success(t("recipientRemoved"));
      void qc.invalidateQueries({ queryKey: ["billing-profile", orgId] });
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, t("recipientRemoveFail")));
    },
  });

  function patch(update: Partial<BillingProfileUpdate>) {
    for (const key of Object.keys(update)) {
      formErrors.clearField(key);
    }
    setForm((current) => (current ? { ...current, ...update } : current));
  }

  return (
    <>
      <FormAlert message={formErrors.formError} />
      <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="billing-legal-name">{t("legalName")}</Label>
                <Input
                  id="billing-legal-name"
                  value={form.legal_name}
                  maxLength={255}
                  placeholder={t("legalNamePlaceholder")}
                  aria-invalid={Boolean(formErrors.fieldErrors.legal_name)}
                  aria-describedby={
                    formErrors.fieldErrors.legal_name
                      ? "billing-legal-name-error"
                      : undefined
                  }
                  onChange={(event) => patch({ legal_name: event.target.value })}
                  data-testid="billing-legal-name"
                />
                <FieldError
                  id="billing-legal-name-error"
                  message={formErrors.fieldErrors.legal_name}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="billing-tax-id">{t("taxId")}</Label>
                <Input
                  id="billing-tax-id"
                  value={form.tax_id}
                  maxLength={16}
                  inputMode="numeric"
                  placeholder={t("taxIdPlaceholder")}
                  aria-invalid={Boolean(formErrors.fieldErrors.tax_id)}
                  aria-describedby={
                    formErrors.fieldErrors.tax_id
                      ? "billing-tax-id-error"
                      : undefined
                  }
                  onChange={(event) => patch({ tax_id: event.target.value })}
                  data-testid="billing-tax-id"
                />
                <FieldError
                  id="billing-tax-id-error"
                  message={formErrors.fieldErrors.tax_id}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("taxIdHint")}
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="billing-email">{t("billingEmail")}</Label>
                <Input
                  id="billing-email"
                  type="email"
                  value={form.billing_email}
                  maxLength={320}
                  placeholder={t("billingEmailPlaceholder")}
                  aria-invalid={Boolean(formErrors.fieldErrors.billing_email)}
                  aria-describedby={
                    formErrors.fieldErrors.billing_email
                      ? "billing-email-error"
                      : undefined
                  }
                  onChange={(event) =>
                    patch({ billing_email: event.target.value })
                  }
                  data-testid="billing-email"
                />
                <FieldError
                  id="billing-email-error"
                  message={formErrors.fieldErrors.billing_email}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="billing-terms">{t("paymentTerms")}</Label>
                <Select
                  value={String(form.payment_terms_days)}
                  onValueChange={(value) =>
                    patch({ payment_terms_days: Number(value) })
                  }
                >
                  <SelectTrigger
                    id="billing-terms"
                    className="h-10 min-h-10"
                    data-testid="billing-terms"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TERMS.map((days) => (
                      <SelectItem key={days} value={String(days)}>
                        {t(`terms_${days}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {t("paymentTermsHint")}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="billing-po-required"
                  checked={form.po_required}
                  onCheckedChange={(checked) =>
                    patch({ po_required: checked === true })
                  }
                  data-testid="billing-po-required"
                />
                <Label htmlFor="billing-po-required">{t("poRequired")}</Label>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Label htmlFor="billing-po-number" className="sr-only">
                  {t("poNumber")}
                </Label>
                <Input
                  id="billing-po-number"
                  value={form.po_number}
                  maxLength={64}
                  disabled={!form.po_required}
                  placeholder={t("poNumberPlaceholder")}
                  aria-invalid={Boolean(formErrors.fieldErrors.po_number)}
                  aria-describedby={
                    formErrors.fieldErrors.po_number
                      ? "billing-po-number-error"
                      : undefined
                  }
                  onChange={(event) => patch({ po_number: event.target.value })}
                  data-testid="billing-po-number"
                />
                <FieldError
                  id="billing-po-number-error"
                  message={formErrors.fieldErrors.po_number}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="space-y-1">
                <h4 className="text-sm font-medium tracking-wide text-foreground">
                  {t("recipientsTitle")}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t("recipientsHint")}
                </p>
              </div>
              {profile.recipients.length > 0 ? (
                <ul className="space-y-2" data-testid="billing-recipients">
                  {profile.recipients.map((recipient) => (
                    <li
                      key={recipient.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">
                          {recipient.email}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {recipient.is_primary
                            ? t("recipientPrimary")
                            : t("recipientCc")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11 sm:min-h-9"
                        disabled={removeMut.isPending}
                        onClick={() => removeMut.mutate(recipient.id)}
                        aria-label={t("removeRecipient")}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("recipientsEmpty")}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Label htmlFor="billing-recipient-email" className="sr-only">
                  {t("recipientEmail")}
                </Label>
                <Input
                  id="billing-recipient-email"
                  type="email"
                  value={recipientEmail}
                  maxLength={320}
                  placeholder={t("recipientPlaceholder")}
                  aria-invalid={Boolean(formErrors.fieldErrors.email)}
                  aria-describedby={
                    formErrors.fieldErrors.email
                      ? "billing-recipient-email-error"
                      : undefined
                  }
                  onChange={(event) => {
                    setRecipientEmail(event.target.value);
                    formErrors.clearField("email");
                  }}
                  data-testid="billing-recipient-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 sm:min-h-10"
                  disabled={!recipientEmail || addMut.isPending}
                  onClick={() => addMut.mutate(recipientEmail)}
                  data-testid="billing-recipient-add"
                >
                  {addMut.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="mr-1 h-4 w-4" aria-hidden />
                  )}
                  {t("addRecipient")}
                </Button>
              </div>
              <FieldError
                id="billing-recipient-email-error"
                message={formErrors.fieldErrors.email}
              />
            </div>

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate(form)}
          data-testid="billing-profile-save"
        >
          {saveMut.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          {t("saveBilling")}
        </Button>
      </div>
    </>
  );
}

function BillingProfileCard({ orgId }: { readonly orgId: string }) {
  const { t } = useTranslation("subscription");
  const query = useQuery({
    queryKey: ["billing-profile", orgId],
    queryFn: () => getBillingProfile(orgId),
    retry: false,
  });

  return (
    <WorkspaceShell testid="billing-profile">
      <WorkspaceShellHead
        icon={Wallet}
        title={t("billingDetailsTitle")}
        hint={t("billingDetailsHint")}
      />
      <WorkspaceShellBody className="space-y-4">
        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : query.isError || !query.data ? (
          <p className="text-sm text-muted-foreground">
            {t("billingLoadFail")}
          </p>
        ) : (
          <BillingProfileForm orgId={orgId} profile={query.data} />
        )}
      </WorkspaceShellBody>
    </WorkspaceShell>
  );
}

export default BillingProfileCard;
