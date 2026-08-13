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
    expect(screen.getByRole("heading", { name: "User Guide" })).toBeInTheDocument();
    expect(screen.getAllByText("Daftar isi").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("heading", {
        name: "1. Mulai: daftar, login, workspace",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "2. Scan IP — step by step" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "3. Scan Domain — step by step" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "4. Scan Mobile — step by step" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "5. Baca hasil & unduh laporan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "6. Jadwal scan berkala (Scan Attach)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "7. Workspace & undangan — step by step",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "8. Kredit — step by step" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "9. Guard (runtime thin) — step by step",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Start IP scan")).toBeInTheDocument();
    expect(screen.getByText("Buat jadwal")).toBeInTheDocument();
    expect(screen.getByText("Aktifkan Guard")).toBeInTheDocument();
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
    expect(
      screen.getAllByRole("navigation", { name: "Daftar isi panduan" }).length,
    ).toBeGreaterThanOrEqual(1);
    const debianBlock = screen.getByText("Debian / Ubuntu").closest("details");
    expect(debianBlock).toBeTruthy();
    expect(debianBlock).not.toHaveAttribute("open");
  });
});
