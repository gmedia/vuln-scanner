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
  "Lanjut blok instalasi agen di bawah (per distro + manager_host dari response). Jangan menebak IP Manager.",
  "Start agen, lalu di dashboard Guard klik Sync. Cek tabel Agen (active/pending/disconnected) dan Alert kritis.",
] as const;

export const GUARD_AGENT_INSTALL_STEPS = [
  "Prasyarat: Linux 64-bit yang Anda kuasai; root/sudo; outbound ke manager_host (port komunikasi agen ↔ Manager — ikuti runbook ops bila non-default). Jangan buka password Manager di host.",
  "Ambil field dari response enroll: agent_id, agent_key, manager_host, dan install_hint (jika ada, prioritaskan perintah di situ).",
  "Pilih blok perintah distro di bawah (Debian/Ubuntu vs RHEL-family vs SUSE). Versi paket harus kompatibel dengan Manager lab/prod — tanya ops bila ragu. Jangan hardcode URL lab di ticket publik.",
  "Setelah paket terpasang: set alamat Manager ke manager_host dari response (bukan tebakan). Path umum: /var/ossec/etc/ossec.conf — elemen <address> di blok client.",
  "Import kunci agen: gunakan agent_key (dan agent_id bila diminta tool) lewat utilitas resmi (sering: /var/ossec/bin/manage_agents atau import key), atau ikuti install_hint. Key file mode 600; jangan log ke CI.",
  "Aktifkan layanan: sudo systemctl daemon-reload && sudo systemctl enable --now wazuh-agent (nama unit bisa berbeda). Cek: systemctl status wazuh-agent.",
  "Verifikasi di host: agen running; log lokal tanpa error auth berulang. Di app: Guard → Sync → status agen active (bukan pending lama). Alert kritis muncul setelah rule level memenuhi ambang (default ≥ 12).",
  "Larangan: password/user Manager Wazuh, API key global app, atau alamat internal lab di git/chat/screenshot publik. Enroll selalu lewat token SaaS + HTTPS ke origin app.",
] as const;

export const GUARD_AGENT_INSTALL_INTRO =
  "Instalasi runtime agen di host target — perintah per distro Linux (placeholder saja). Utamakan install_hint + manager_host dari POST /api/guard/enroll. Bukan tutorial SIEM penuh; tanpa secret lab.";

export type GuardDistroInstallGuide = {
  id: string;
  title: string;
  blurb: string;
  commands: readonly string[];
};

export const GUARD_DISTRO_INSTALL_GUIDES: readonly GuardDistroInstallGuide[] = [
  {
    id: "debian-ubuntu",
    title: "Debian / Ubuntu",
    blurb:
      "Keluarga apt/dpkg. Ganti <WAZUH_VERSION> agar cocok Manager; utamakan install_hint bila ada.",
    commands: [
      "sudo apt-get update",
      "sudo apt-get install -y curl gnupg apt-transport-https",
      "curl -sSL https://packages.wazuh.com/key/GPG-KEY-WAZUH | sudo gpg --dearmor -o /usr/share/keyrings/wazuh.gpg",
      'echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | sudo tee /etc/apt/sources.list.d/wazuh.list',
      "sudo apt-get update",
      "sudo apt-get install -y wazuh-agent",
      "sudo sed -i 's|<address>.*</address>|<address><MANAGER_HOST></address>|g' /var/ossec/etc/ossec.conf",
      "sudo /var/ossec/bin/manage_agents",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable --now wazuh-agent",
      "sudo systemctl status wazuh-agent --no-pager",
    ],
  },
  {
    id: "rhel-family",
    title: "RHEL / CentOS / Rocky / AlmaLinux / Fedora",
    blurb:
      "Keluarga rpm/dnf (yum di rilis lama). Nama unit tetap wazuh-agent pada paket resmi.",
    commands: [
      "sudo dnf install -y curl",
      "sudo rpm --import https://packages.wazuh.com/key/GPG-KEY-WAZUH",
      'printf "%s\\n" "[wazuh]" "gpgcheck=1" "gpgkey=https://packages.wazuh.com/key/GPG-KEY-WAZUH" "enabled=1" "name=Wazuh repository" "baseurl=https://packages.wazuh.com/4.x/yum/" "protect=1" | sudo tee /etc/yum.repos.d/wazuh.repo',
      "sudo dnf install -y wazuh-agent",
      "sudo sed -i 's|<address>.*</address>|<address><MANAGER_HOST></address>|g' /var/ossec/etc/ossec.conf",
      "sudo /var/ossec/bin/manage_agents",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable --now wazuh-agent",
      "sudo systemctl status wazuh-agent --no-pager",
    ],
  },
  {
    id: "suse",
    title: "SLES / openSUSE",
    blurb:
      "zypper. Paket sering lewat mirror ops atau RPM setara; sesuaikan channel dengan Manager.",
    commands: [
      "sudo zypper refresh",
      "sudo zypper install -y curl",
      "sudo zypper install -y wazuh-agent",
      "sudo sed -i 's|<address>.*</address>|<address><MANAGER_HOST></address>|g' /var/ossec/etc/ossec.conf",
      "sudo /var/ossec/bin/manage_agents",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable --now wazuh-agent",
      "sudo systemctl status wazuh-agent --no-pager",
    ],
  },
] as const;

export const GUARD_DISTRO_INSTALL_FOOTER =
  "Ganti <MANAGER_HOST> dari response enroll. Import agent_key lewat manage_agents (atau install_hint). Opsi paket .deb/.rpm lokal: dpkg -i / rpm -ivh dari mirror ops. Jangan menempel password Manager atau IP lab di chat/repo publik.";
