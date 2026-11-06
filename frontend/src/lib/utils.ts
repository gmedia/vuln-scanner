import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** One field-level validation issue from the API (FastAPI 422 or the
 * normalized `validation_error` envelope). */
export interface ApiValidationIssue {
  field?: string;
  msg: string;
  type?: string;
  params?: Record<string, string | number>;
}

/** Every error body shape the API can emit. `detail` stays a string for
 * business errors; request-validation errors add `fields` / `errors`. */
export interface ApiErrorBody {
  detail?: string | ApiValidationIssue[];
  code?: string;
  params?: Record<string, string | number>;
  fields?: Record<string, string>;
  errors?: ApiValidationIssue[];
}

export interface ApiError {
  response?: {
    status?: number;
    data?: ApiErrorBody;
  };
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCredits(n: number): string {
  return `${n} credit${n === 1 ? "" : "s"}`;
}

export function isValidPort(p: string): boolean {
  const trimmed = p.trim();
  if (!trimmed) return true;
  // Comma-separated: 22,80,443
  if (/^\d+(,\d+)*$/.test(trimmed)) {
    return trimmed.split(",").every((n) => {
      const port = parseInt(n, 10);
      return port >= 1 && port <= 65535;
    });
  }
  // Range: 1-1000
  const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    return start >= 1 && end <= 65535 && start <= end;
  }
  return false;
}
