import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UserGuide from "@/pages/UserGuide";

describe("UserGuide", () => {
  it("renders title, toc, and step-by-step section headings", () => {
    render(
      <MemoryRouter>
        <UserGuide />
      </MemoryRouter>,
    );
     expect(screen.getByRole("heading", { name: "Panduan pengguna" })).toBeInTheDocument();
    expect(screen.getAllByText("Daftar isi").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("heading", {
        name: "Mulai: daftar, login, workspace",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Scan IP — langkah demi langkah",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Scan Domain — langkah demi langkah",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Scan Mobile — langkah demi langkah",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Baca hasil & unduh laporan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Jadwal scan berkala (Scan Attach)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Workspace & undangan",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Kredit" }),
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
        name: "SIEM — cari event & kasus",
      }),
    ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Tips & batasan" }),
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
      /Instalasi runtime agen di host target/,
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
      name: "Daftar isi panduan",
    });
    expect(tocNavs.length).toBeGreaterThanOrEqual(2);
    const mobileToc = tocNavs[0]?.closest("[data-slot='card']");
    expect(mobileToc).toBeTruthy();
    expect(mobileToc?.parentElement).toHaveClass("sticky");
    expect(
      screen.getByRole("button", { name: /Daftar isi/ }),
    ).toHaveAttribute("aria-expanded", "false");
    const desktopToc = screen.getByTestId("guide-desktop-toc");
    expect(desktopToc.querySelector(".sticky")).toBeTruthy();
    expect(desktopToc.className).toMatch(/lg:block/);
    const debianTrigger = screen.getByRole("button", {
      name: /Debian \/ Ubuntu/,
    });
    expect(debianTrigger).toHaveAttribute("aria-expanded", "false");
    expect(debianTrigger).toHaveAttribute("data-state", "closed");
  });
});
