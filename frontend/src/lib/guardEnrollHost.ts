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

export const GUARD_HOST_SETUP_STEP_KEYS = [
  "hostStep1",
  "hostStep2",
  "hostStep3",
  "hostStep4",
  "hostStep5",
  "hostStep6",
] as const;

export const GUARD_AGENT_INSTALL_STEP_KEYS = [
  "installStep1",
  "installStep2",
  "installStep3",
  "installStep4",
  "installStep5",
  "installStep6",
  "installStep7",
  "installStep8",
] as const;

export const GUARD_AGENT_INSTALL_INTRO_KEY = "installIntro";

export const GUARD_DISTRO_INSTALL_FOOTER_KEY = "distroFooter";

// Route/file paths live outside the locale catalog so the i18n copy test can
// keep rejecting raw route paths while the sentences stay readable.
export const GUARD_ENROLL_PATH_VARS = {
  enrollPath: "/api/guard/enroll",
  ossecConfPath: "/var/ossec/etc/ossec.conf",
  manageAgentsPath: "/var/ossec/bin/manage_agents",
} as const;

export type GuardDistroInstallGuide = {
  id: string;
  title: string;
  blurbKey: string;
  commands: readonly string[];
};

export const GUARD_DISTRO_INSTALL_GUIDES: readonly GuardDistroInstallGuide[] = [
  {
    id: "debian-ubuntu",
    title: "Debian / Ubuntu",
    blurbKey: "distroDebianBlurb",
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
    blurbKey: "distroRhelBlurb",
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
    blurbKey: "distroSuseBlurb",
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
