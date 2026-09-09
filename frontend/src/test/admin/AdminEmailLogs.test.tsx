import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AdminEmailLogs, { emailLogPageItems } from "@/pages/admin/AdminEmailLogs";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  keepPreviousData: (prev: unknown) => prev,
}));

vi.mock("@/api/admin", () => ({
  adminApi: { getEmailLogs: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminEmailLogs />
    </MemoryRouter>,
  );
}

describe("AdminEmailLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);
    renderPage();
    expect(screen.getByText("Email send logs")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);
    renderPage();
    expect(screen.getByText("No send attempts recorded")).toBeInTheDocument();
  });

  it("renders masked recipient and failed status", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: {
        total: 1,
        items: [
          {
            id: "1",
            kind: "verification",
            status: "failed",
            recipient_masked: "u***@example.com",
            attempts: 3,
            error_message: "SMTP timeout",
            created_at: "2026-09-01T12:00:00Z",
          },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useQuery>);
    renderPage();
    expect(screen.getAllByText("u***@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SMTP timeout").length).toBeGreaterThan(0);
  });

  it("shows page number buttons when total spans multiple pages", async () => {
    const user = userEvent.setup();
    vi.mocked(useQuery).mockReturnValue({
      data: {
        total: 45,
        items: [
          {
            id: "1",
            kind: "verification",
            status: "sent",
            recipient_masked: "a***@example.com",
            attempts: 1,
            error_message: null,
            created_at: "2026-09-01T12:00:00Z",
          },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useQuery>);
    renderPage();
    expect(screen.getByTestId("email-logs-pagination")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Page 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 3" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    expect(useQuery).toHaveBeenCalled();
  });
});

describe("emailLogPageItems", () => {
  it("lists all pages when total is small", () => {
    expect(emailLogPageItems(1, 3)).toEqual([1, 2, 3]);
  });

  it("inserts ellipsis for a long range", () => {
    expect(emailLogPageItems(1, 20)).toEqual([1, 2, "ellipsis", 20]);
    expect(emailLogPageItems(10, 20)).toEqual([
      1,
      "ellipsis",
      9,
      10,
      11,
      "ellipsis",
      20,
    ]);
  });
});
