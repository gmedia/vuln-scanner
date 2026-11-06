import i18n from "@/i18n";
import type { ApiError, ApiValidationIssue } from "@/lib/utils";

type ErrorBody = NonNullable<ApiError["response"]>["data"];

export interface ExtractedApiError {
  status?: number;
  code?: string;
  params: Record<string, string | number>;
  /** Human-readable message for a banner/toast. Never `[object Object]`. */
  message: string;
  /** Field name -> message, for inline rendering next to the input. */
  fields: Record<string, string>;
  /** Normalized per-field issues (empty for non-validation errors). */
  issues: ApiValidationIssue[];
}

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("response" in error)) {
    return undefined;
  }
  return (error as ApiError).response?.status;
}

function body(error: unknown): ErrorBody {
  if (!error || typeof error !== "object" || !("response" in error)) {
    return undefined;
  }
  return (error as ApiError).response?.data;
}

function isIssue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const SOURCE_PREFIXES = new Set(["body", "query", "path", "header", "cookie"]);

/** `["body","findings",0,"class"]` -> `findings[0].class`. */
export function fieldPath(loc: unknown): string {
  if (!Array.isArray(loc)) return "";
  const parts = loc.filter((p) => p !== undefined && p !== null);
  if (parts.length > 0 && SOURCE_PREFIXES.has(String(parts[0]))) parts.shift();

  let out = "";
  for (const part of parts) {
    if (typeof part === "number" || /^\d+$/.test(String(part))) {
      out += `[${part}]`;
    } else {
      out = out ? `${out}.${String(part)}` : String(part);
    }
  }
  return out;
}

function cleanMessage(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/^Value error,\s*/, "").trim();
}

function cleanParams(raw: unknown): Record<string, string | number> {
  if (!isIssue(raw)) return {};
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" || typeof value === "number") out[key] = value;
    else if (typeof value === "boolean") out[key] = value ? "true" : "false";
  }
  return out;
}

/** Accepts the normalized `errors[]`, a raw FastAPI `detail[]`, or a single
 * `{msg}` object. Always returns a flat list, never throws. */
function normalizeIssues(raw: unknown): ApiValidationIssue[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const issues: ApiValidationIssue[] = [];

  for (const item of list) {
    if (typeof item === "string") {
      const msg = cleanMessage(item);
      if (msg) issues.push({ msg });
      continue;
    }
    if (!isIssue(item)) continue;

    const msg = cleanMessage(item.msg ?? item.message ?? item.detail);
    const field =
      typeof item.field === "string" ? item.field : fieldPath(item.loc);
    const type = typeof item.type === "string" ? item.type : undefined;
    const params = cleanParams(item.params ?? item.ctx);

    if (!msg && !type) continue;
    issues.push({
      msg: msg || type || "",
      field: field || undefined,
      type,
      ...(Object.keys(params).length > 0 ? { params } : {}),
    });
  }
  return issues;
}

function localizeIssue(issue: ApiValidationIssue): string {
  // `value_error` carries a specific server message (custom validator); a
  // generic translation would hide it. All other types map to a friendly text.
  if (issue.type && issue.type !== "value_error") {
    const translated = i18n.t(`errors:validation.${issue.type}`, {
      ...(issue.params ?? {}),
      defaultValue: "",
    });
    if (translated) return translated;
  }
  return issue.msg;
}

function joinMessages(messages: string[]): string {
  return [...new Set(messages.filter((m) => m && m.trim()))].join("; ");
}

function translateCode(
  code: string | undefined,
  params: Record<string, string | number>,
): string | undefined {
  if (!code || code === "validation_error") return undefined;
  const translated = i18n.t(`errors:${code}`, {
    ...params,
    defaultValue: "",
  });
  return translated || undefined;
}

/** The single source of truth for turning an API failure into UI text. */
export function extractApiError(
  error: unknown,
  fallback: string,
): ExtractedApiError {
  const data = body(error);
  const code = typeof data?.code === "string" && data.code.trim()
    ? data.code
    : undefined;
  const params = cleanParams(data?.params);

  const issues = normalizeIssues(data?.errors);
  // FastAPI's default body has `detail: [...]`; the normalized handler puts the
  // list in `errors` and keeps `detail` a string. Support both.
  if (issues.length === 0) issues.push(...normalizeIssues(data?.detail));

  const fields: Record<string, string> = {};
  // Issues carry the Pydantic `type`, so they can be localized. Prefer them
  // over the backend's raw `fields` map, which exists only as a fallback for
  // bodies that arrive without `errors`.
  for (const issue of issues) {
    if (issue.field && !fields[issue.field]) {
      fields[issue.field] = localizeIssue(issue);
    }
  }
  for (const [field, message] of Object.entries(data?.fields ?? {})) {
    if (typeof message === "string" && message.trim() && !fields[field]) {
      fields[field] = message;
    }
  }

  const message = translateCode(code, params) ?? joinMessages(issues.map(localizeIssue));

  if (message) {
    return {
      status: statusOf(error),
      code,
      params,
      message,
      fields,
      issues,
    };
  }

  const detail = typeof data?.detail === "string" ? data.detail.trim() : "";
  const genericValidation =
    code === "validation_error"
      ? i18n.t("errors:validation_error", { defaultValue: "" })
      : "";

  return {
    status: statusOf(error),
    code,
    params,
    message: detail || genericValidation || translateCode(code, params) || fallback,
    fields,
    issues,
  };
}

export function apiErrorCode(error: unknown): string | undefined {
  const code = body(error)?.code;
  return typeof code === "string" && code.trim() ? code : undefined;
}

export function apiErrorParams(error: unknown): Record<string, string | number> {
  return cleanParams(body(error)?.params);
}

/** Field name -> message, safe to spread into form state. */
export function apiFieldErrors(error: unknown): Record<string, string> {
  return extractApiError(error, "").fields;
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  return extractApiError(error, fallback).message;
}
