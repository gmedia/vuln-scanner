import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UserGuide from "@/pages/UserGuide";
import { SidebarProvider } from "@/components/ui/sidebar";

describe("UserGuide", () => {
  it("renders title, toc, and step-by-step section headings", () => {
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
    expect(document.body.textContent ?? "").toMatch(
      /apt-get install -y wazuh-agent/,
    );
    expect(document.body.textContent ?? "").toMatch(
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
    const tocNavs = screen.getAllByRole("navigation", {
      name: "Guide table of contents",
    });
    expect(tocNavs.length).toBeGreaterThanOrEqual(2);
    const mobileToc = tocNavs[0]?.closest("[data-slot='card']");
    expect(mobileToc).toBeTruthy();
    expect(mobileToc?.parentElement).toHaveClass("sticky", "top-14");
    expect(screen.getByRole("button", { name: /Contents/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    const desktopToc = screen.getByTestId("guide-desktop-toc");
    expect(desktopToc.className).toMatch(/lg:block/);
    expect(desktopToc.querySelector(".sticky")).toBeTruthy();
    expect(desktopToc.querySelector("[data-slot='sidebar']")).toBeTruthy();
    const debianTrigger = screen.getByRole("button", {
      name: /Debian \/ Ubuntu/,
    });
    expect(debianTrigger).toHaveAttribute("aria-expanded", "false");
    expect(debianTrigger).toHaveAttribute("data-state", "closed");
  });
});
