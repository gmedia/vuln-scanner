import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Inbox from "@/pages/Inbox";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  keepPreviousData: (prev: unknown) => prev,
}));

vi.mock("@/api/inbox", () => ({
  inboxApi: { list: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <Inbox />
    </MemoryRouter>,
  );
}

describe("Inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading without Guard copy", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);
    renderPage();
    expect(screen.getByTestId("inbox-page")).toBeInTheDocument();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.queryByText(/Guard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Delivered/i)).not.toBeInTheDocument();
  });

  it("renders empty state without upgrade or Guard CTA", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);
    renderPage();
    expect(screen.getByTestId("inbox-empty")).toHaveTextContent(
      "No product email yet.",
    );
    expect(screen.queryByText(/upgrade/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Guard/i)).not.toBeInTheDocument();
  });

  it("renders sent row with masked recipient and no error_message", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: {
        total: 1,
        items: [
          {
            id: "1",
            kind: "scan_diff",
            status: "sent",
            recipient_masked: "t***@example.com",
            attempts: 1,
            created_at: "2026-09-16T12:00:00Z",
            job_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useQuery>);
    renderPage();
    expect(screen.getAllByText("t***@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Scan diff").length).toBeGreaterThan(0);
    expect(screen.queryByText("error_message")).not.toBeInTheDocument();
    expect(screen.queryByText("SMTP timeout")).not.toBeInTheDocument();
    const links = screen.getAllByTestId("inbox-job-link");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute(
      "href",
      "/scan/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
  });

  it("does not link uptime rows", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: {
        total: 1,
        items: [
          {
            id: "2",
            kind: "uptime",
            status: "sent",
            recipient_masked: "t***@example.com",
            attempts: 1,
            created_at: "2026-09-16T12:00:00Z",
            job_id: null,
          },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useQuery>);
    renderPage();
    expect(screen.queryByTestId("inbox-job-link")).not.toBeInTheDocument();
  });
});
