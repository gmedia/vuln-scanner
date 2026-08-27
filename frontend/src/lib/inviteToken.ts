const STORAGE_KEY = "sinexis.pendingInviteToken";

const TOKEN_RE = /^[A-Za-z0-9_-]{8,256}$/;

export function isInviteToken(value: string | null | undefined): boolean {
  if (!value) return false;
  return TOKEN_RE.test(value.trim());
}

export function persistInviteToken(raw: string | null | undefined): void {
  const token = raw?.trim() ?? "";
  if (!isInviteToken(token)) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    return;
  }
}

export function readInviteToken(): string | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (isInviteToken(stored)) return stored!.trim();
  } catch {
    return null;
  }
  return null;
}

export function clearInviteToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

export function captureInviteFromSearch(search: string): string | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search : `?${search}`,
  );
  const token = params.get("invite") ?? params.get("token");
  if (!isInviteToken(token)) return null;
  persistInviteToken(token);
  return token!.trim();
}

export function workspaceInvitePath(token?: string | null): string {
  const t = token?.trim() || readInviteToken();
  if (t && isInviteToken(t)) {
    return `/settings/workspace?invite=${encodeURIComponent(t)}`;
  }
  return "/settings/workspace";
}

export function postAuthPath(): string {
  return readInviteToken() ? workspaceInvitePath() : "/dashboard";
}

export function publicInviteUrl(token: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://sinexis.app";
  return `${origin}/settings/workspace?invite=${encodeURIComponent(token)}`;
}
