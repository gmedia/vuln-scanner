export function resolveApiBaseUrl(
  viteApiUrl: string | undefined,
  windowOrigin: string | undefined,
): string {
  const fromEnv = (viteApiUrl ?? "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const origin = (windowOrigin ?? "").trim().replace(/\/$/, "");
  return origin;
}

export function buildEnrollCurlExample(
  apiBase: string,
  tokenPlaceholder = "<ENROLL_TOKEN>",
  agentNamePlaceholder = "<AGENT_NAME>",
): string {
  const base = apiBase.replace(/\/$/, "") || "https://<APP_ORIGIN>";
  return [
    `curl -sS -X POST '${base}/api/guard/enroll' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{"token":"${tokenPlaceholder}","agent_name":"${agentNamePlaceholder}"}'`,
  ].join("\n");
}

export type EnrollResponseFields = {
  agent_id: string;
  agent_name: string;
  agent_key: string;
  manager_host: string;
  install_hint: string;
};

export const GUARD_HOST_SETUP_STEPS = [
  "Pastikan host Linux/VPS/colo yang Anda kuasai, outbound HTTPS ke origin API app (bukan password Manager).",
  "Simpan token enroll di vault host (env/file mode 600). Jangan commit ke git atau tempel di chat publik.",
  "Dari host, POST /api/guard/enroll dengan JSON { token, agent_name } — agent_name unik per mesin (1–63 karakter).",
  "Response berisi agent_id, agent_key, manager_host, install_hint. Simpan agent_key hanya di host.",
  "Pasang runtime agen sesuai paket/versi dari penyedia atau runbook ops internal; arahkan ke manager_host dari response (bukan menebak IP).",
  "Start agen, lalu di dashboard Guard klik Sync. Cek tabel Agen (active/pending/disconnected) dan Alert kritis.",
] as const;
