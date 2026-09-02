import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import UserGuide from "@/pages/UserGuide";
import { SidebarProvider } from "@/components/ui/sidebar";

describe("UserGuide", () => {
  it("renders title, toc, and step-by-step section headings", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SidebarProvider>
          <UserGuide />
        </SidebarProvider>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "User guide" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Contents").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("heading", {
        name: "Start: register, login, workspace",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "IP scan — step by step",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Domain scan — step by step",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Mobile scan — step by step",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Read results & download reports" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Recurring scan schedules (Scan Attach)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Assets — named scan targets",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Workspace & invites",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Credits" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Guard (runtime thin) — step by step",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Start IP scan")).toBeInTheDocument();
    expect(screen.getByText("Buat jadwal")).toBeInTheDocument();
    expect(screen.getByText("Aktifkan Guard")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "SIEM — search events & cases",
      }),
    ).toBeInTheDocument();
    expect(document.body.textContent ?? "").toMatch(
      /incident ticket in this app/i,
    );
    expect(document.body.textContent ?? "").toMatch(/not a Wazuh plugin/i);
    expect(document.body.textContent ?? "").toMatch(/we are working this/i);
    expect(
      screen.getByRole("heading", {
        name: "Uptime — HTTP/TCP probes",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Status page — public comms",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Host Protect — on-box malware",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Host Protect" })).toHaveAttribute(
      "href",
      "/host",
    );
    expect(document.body.querySelector('a[href="#guard"]')).toBeTruthy();
    expect(document.body.textContent ?? "").toMatch(/Host Protect helper/i);
    expect(document.body.textContent ?? "").toMatch(/sinexis-install\.sh/);
    expect(document.body.textContent ?? "").toMatch(/raw\.githubusercontent\.com/);
    expect(document.body.textContent ?? "").toMatch(/DOCTYPE html/);
    expect(document.body.textContent ?? "").toMatch(/Do not clone the repo/);
    expect(screen.getByTestId("sinexis-install-wget").textContent).toMatch(
      /wget -O sinexis-install\.sh/,
    );
    expect(screen.getByTestId("sinexis-install-wget").textContent).toMatch(
      /head -n1 sinexis-install\.sh/,
    );
    expect(document.body.textContent ?? "").toMatch(/install wazuh-agent/i);
    expect(
      screen.getByRole("link", { name: "sinexis-install.sh" }),
    ).toHaveAttribute(
      "href",
      "https://raw.githubusercontent.com/gmedia/vuln-scanner/main/packaging/host-protect-helper/sinexis-install.sh",
    );
    expect(screen.getByRole("link", { name: "GitHub Release" })).toHaveAttribute(
      "href",
      "https://github.com/gmedia/vuln-scanner/releases",
    );
    expect(document.body.textContent ?? "").toMatch(/curl \| bash/);
    expect(document.body.textContent ?? "").toMatch(/sinexis-host-protect@/i);
    expect(document.body.textContent ?? "").toMatch(/quarantine/i);
    expect(document.body.textContent ?? "").toMatch(/reconstruct/i);
    expect(document.body.textContent ?? "").toMatch(/Copy nginx snippet/);
    expect(document.body.textContent ?? "").toMatch(/not Coraza on sinexis\.app/);
    expect(document.body.textContent ?? "").toMatch(/Host Multi/);
    expect(document.body.textContent ?? "").toMatch(/SecRuleEngine On/);
    expect(document.body.textContent ?? "").toMatch(/Hourly/);
    expect(
      screen.getByRole("heading", { name: "Tips & limits" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/POST \/api\/guard\/enroll/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/Langkah host \(setelah token\)/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/manager_host/).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(document.body.textContent ?? "").toMatch(/api\/guard\/enroll/);
    expect(document.body.textContent ?? "").toMatch(/wazuh-agent/i);
    expect(document.body.textContent ?? "").toMatch(/systemctl/);
    expect(document.body.textContent ?? "").toMatch(
      /Agent runtime install on the target host/,
    );
    expect(
      screen.getByTestId("guard-distro-install-commands"),
    ).toBeInTheDocument();
    expect(screen.getByText("Debian / Ubuntu")).toBeInTheDocument();
    expect(
      screen.getByText(/RHEL \/ CentOS \/ Rocky \/ AlmaLinux \/ Fedora/),
    ).toBeInTheDocument();
    expect(screen.getByText(/SLES \/ openSUSE/)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(
      /apt-get install -y wazuh-agent/,
    );
    expect(document.body.textContent ?? "").not.toMatch(
      /dnf install -y wazuh-agent/,
    );
    expect(screen.getByRole("link", { name: "IP Scanner" })).toHaveAttribute(
      "href",
      "/scan/ip",
    );
    const scheduleLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/schedules");
    expect(scheduleLinks.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: "Assets" })).toHaveAttribute(
      "href",
      "/assets",
    );
    expect(screen.getByRole("link", { name: "Uptime" })).toHaveAttribute(
      "href",
      "/uptime",
    );
    expect(screen.getByRole("link", { name: "Status page" })).toHaveAttribute(
      "href",
      "/uptime/status-page",
    );
    expect(screen.getByText("Add monitor")).toBeInTheDocument();
    expect(screen.getByText("Create page")).toBeInTheDocument();
    expect(screen.getByText("Add asset")).toBeInTheDocument();
    const tocNavs = screen.getAllByRole("navigation", {
      name: "Guide table of contents",
    });
    expect(tocNavs.length).toBeGreaterThanOrEqual(2);
    const mobileToc = tocNavs[0]?.closest("[data-slot='card']");
    expect(mobileToc).toBeTruthy();
    expect(mobileToc?.parentElement).toHaveClass("sticky", "top-14");
    const contentsToggle = screen.getByRole("button", { name: /Contents/ });
    expect(contentsToggle).toHaveAttribute("aria-expanded", "false");
    const tocLink = screen.getAllByRole("link", {
      name: "1. Start: register, login, workspace",
    })[0];
    expect(tocLink.className).toMatch(/min-h-11/);
    const desktopToc = screen.getByTestId("guide-desktop-toc");
    expect(desktopToc.className).toMatch(/lg:block/);
    expect(desktopToc.querySelector(".sticky")).toBeTruthy();
    expect(desktopToc.querySelector("[data-slot='sidebar']")).toBeTruthy();
    const debianTrigger = screen.getByRole("button", {
      name: /Debian \/ Ubuntu/,
    });
    expect(debianTrigger).toHaveAttribute("aria-expanded", "false");
    expect(debianTrigger).toHaveAttribute("data-state", "closed");
    await user.click(debianTrigger);
    expect(debianTrigger).toHaveAttribute("aria-expanded", "true");
    expect(document.body.textContent ?? "").toMatch(
      /apt-get install -y wazuh-agent/,
    );
    await user.click(debianTrigger);
    expect(debianTrigger).toHaveAttribute("aria-expanded", "false");
    expect(document.body.textContent ?? "").not.toMatch(
      /apt-get install -y wazuh-agent/,
    );
  });
});
