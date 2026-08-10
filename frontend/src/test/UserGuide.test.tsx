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
    expect(screen.getByText("Daftar isi")).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "IP Scanner" })).toHaveAttribute(
      "href",
      "/scan/ip",
    );
    const scheduleLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/schedules");
    expect(scheduleLinks.length).toBeGreaterThanOrEqual(1);
  });
});
