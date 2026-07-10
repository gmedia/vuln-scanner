import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export interface ApiError {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
