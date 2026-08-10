import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UserGuide from "@/pages/UserGuide";

describe("UserGuide", () => {
  it("renders title, toc anchors, and key sections", () => {
    render(
      <MemoryRouter>
        <UserGuide />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "User Guide" })).toBeInTheDocument();
    expect(screen.getByText("Daftar isi")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mulai cepat" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Scan (IP / Domain / Mobile)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Jadwal (Scan Attach)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Guard (runtime thin)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    const scheduleLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/schedules");
    expect(scheduleLinks.length).toBeGreaterThanOrEqual(1);
    const guardLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/guard");
    expect(guardLinks.length).toBeGreaterThanOrEqual(1);
  });
});
