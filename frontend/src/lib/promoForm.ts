import type { PromoCode, PromoCodeCreateInput, PromoKind, PromoProduct } from "@/api/admin";

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{7,31}$/;

export type PromoFormState = {
  code: string;
  description: string;
  kind: PromoKind;
  percent: string;
  amount: string;
  min: string;
  maxDiscount: string;
  product: "" | PromoProduct;
  sku: string;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
  maxPerOrg: string;
};

export const EMPTY_PROMO_FORM: PromoFormState = {
  code: "",
  description: "",
  kind: "percent",
  percent: "",
  amount: "",
  min: "0",
  maxDiscount: "",
  product: "",
  sku: "",
  startsAt: "",
  endsAt: "",
  maxRedemptions: "",
  maxPerOrg: "1",
};

function toInt(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function promoFormFrom(item: PromoCode): PromoFormState {
  return {
    code: item.code,
    description: item.description,
    kind: item.kind === "fixed" ? "fixed" : "percent",
    percent: item.percent_off_bp == null ? "" : String(item.percent_off_bp / 100),
    amount: item.amount_idr == null ? "" : String(item.amount_idr),
    min: String(item.min_amount_idr ?? 0),
    maxDiscount: item.max_discount_idr == null ? "" : String(item.max_discount_idr),
    product: item.applies_to_product ?? "",
    sku: item.applies_to_sku ?? "",
    startsAt: toLocalInput(item.starts_at),
    endsAt: toLocalInput(item.ends_at),
    maxRedemptions: item.max_redemptions == null ? "" : String(item.max_redemptions),
    maxPerOrg: String(item.max_redemptions_per_org ?? 1),
  };
}

export function validatePromoForm(form: PromoFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!CODE_PATTERN.test(form.code.trim().toUpperCase())) errors.code = "invalid";
  if (form.kind === "percent") {
    const percent = Number(form.percent);
    if (!form.percent.trim() || !Number.isFinite(percent) || percent <= 0 || percent > 100) {
      errors.percent = "invalid";
    }
  } else if (!toInt(form.amount) || (toInt(form.amount) ?? 0) <= 0) {
    errors.amount = "invalid";
  }
  const min = toInt(form.min);
  if (min == null || min < 0) errors.min = "invalid";
  if (form.maxDiscount.trim() && (!toInt(form.maxDiscount) || (toInt(form.maxDiscount) ?? 0) <= 0)) {
    errors.maxDiscount = "invalid";
  }
  if (form.maxRedemptions.trim() && (!toInt(form.maxRedemptions) || (toInt(form.maxRedemptions) ?? 0) < 1)) {
    errors.maxRedemptions = "invalid";
  }
  if (!toInt(form.maxPerOrg) || (toInt(form.maxPerOrg) ?? 0) < 1) errors.maxPerOrg = "invalid";
  if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) {
    errors.endsAt = "invalid";
  }
  return errors;
}

export function buildPromoBody(form: PromoFormState): PromoCodeCreateInput {
  const percentKind = form.kind === "percent";
  return {
    code: form.code.trim().toUpperCase(),
    description: form.description.trim(),
    kind: form.kind,
    percent_off_bp: percentKind ? Math.round(Number(form.percent) * 100) : null,
    amount_idr: percentKind ? null : toInt(form.amount),
    min_amount_idr: toInt(form.min) ?? 0,
    max_discount_idr: toInt(form.maxDiscount),
    applies_to_product: form.product || null,
    applies_to_sku: form.sku || null,
    starts_at: toIso(form.startsAt),
    ends_at: toIso(form.endsAt),
    max_redemptions: toInt(form.maxRedemptions),
    max_redemptions_per_org: toInt(form.maxPerOrg) ?? 1,
  };
}
