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

/** SaaS enroll path (token → key). No lab IPs or Manager passwords. */
export const GUARD_HOST_SETUP_STEPS = [
  "Pastikan host Linux/VPS/colo yang Anda kuasai, outbound HTTPS ke origin API app (bukan password Manager).",
  "Simpan token enroll di vault host (env/file mode 600). Jangan commit ke git atau tempel di chat publik.",
  "Dari host, POST /api/guard/enroll dengan JSON { token, agent_name } — agent_name unik per mesin (1–63 karakter).",
  "Response berisi agent_id, agent_key, manager_host, install_hint. Simpan agent_key hanya di host.",
  "Lanjut blok instalasi agen di bawah (paket generik + manager_host dari response). Jangan menebak IP Manager.",
  "Start agen, lalu di dashboard Guard klik Sync. Cek tabel Agen (active/pending/disconnected) dan Alert kritis.",
] as const;

/**
 * Generic Wazuh-agent style install on the target host after enroll.
 * Placeholders only — no production hosts, emails, or Manager passwords.
 * Distro package names/paths may vary; prefer install_hint from enroll when present.
 */
export const GUARD_AGENT_INSTALL_STEPS = [
  "Prasyarat: Linux 64-bit yang Anda kuasai; root/sudo; outbound ke manager_host (port komunikasi agen ↔ Manager — ikuti runbook ops bila non-default). Jangan buka password Manager di host.",
  "Ambil field dari response enroll: agent_id, agent_key, manager_host, dan install_hint (jika ada, prioritaskan perintah di situ).",
  "Pasang paket agen runtime dari repositori resmi penyedia atau mirror internal ops (contoh nama paket: wazuh-agent). Versi harus kompatibel dengan Manager lab/prod Anda — tanya ops bila ragu.",
  "Debian/Ubuntu (ilustratif, sesuaikan repo & versi): unduh/install paket .deb resmi → sudo dpkg -i <paket-agen>.deb (atau alur apt dari repo yang diset ops). RHEL/CentOS/Alma: alur rpm/dnf setara. Jangan hardcode URL lab di ticket publik.",
  "Konfigurasi Manager: set alamat ke nilai manager_host dari response (bukan tebakan). Contoh path umum: /var/ossec/etc/ossec.conf — elemen <address> / client. Jangan menempel IP dari dokumentasi publik.",
  "Import kunci agen: gunakan agent_key (dan agent_id bila diminta tool) lewat utilitas resmi agen (sering: manage_agents / import key), atau ikuti install_hint. Simpan key file mode 600; jangan log ke CI.",
  "Aktifkan layanan agen (contoh generik): sudo systemctl daemon-reload && sudo systemctl enable --now wazuh-agent (nama unit bisa berbeda per paket). Cek status: systemctl status <unit-agen>.",
  "Verifikasi di host: agen running; log lokal tanpa error auth berulang. Di app: Guard → Sync → status agen active (bukan pending lama). Alert kritis muncul setelah rule level memenuhi ambang (default ≥ 12).",
  "Larangan: password/user Manager Wazuh, API key global app, atau alamat internal lab di git/chat/screenshot publik. Enroll selalu lewat token SaaS + HTTPS ke origin app.",
] as const;

/** One-line note shown above install steps (UI + guide). */
export const GUARD_AGENT_INSTALL_INTRO =
  "Instalasi runtime agen (generik, tanpa secret). Ganti placeholder; utamakan install_hint + manager_host dari POST /api/guard/enroll. Bukan tutorial SIEM penuh.";
