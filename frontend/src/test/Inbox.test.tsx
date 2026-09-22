import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import Inbox from "@/pages/Inbox";
import { inboxApi } from "@/api/inbox";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  keepPreviousData: (prev: unknown) => prev,
}));

vi.mock("@/api/inbox", () => ({
  inboxApi: { list: vi.fn() },
}));

vi.mock("@/components/ui/Select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children?: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <div data-testid="select-mock" data-value={value}>
      {children}
      <input
        aria-label="select-probe"
        value={value ?? ""}
        onChange={(e) => onValueChange?.(e.target.value)}
        style={{ display: "none" }}
      />
    </div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => <span />,
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children?: React.ReactNode;
    value?: string;
  }) => (
    <div role="option" aria-selected="false" data-value={value}>
      {children}
    </div>
  ),
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

  it("F1 renders bounced scan_diff row with badge, masked addr, no error, job link", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: {
        total: 1,
        items: [
          {
            id: "b1",
            kind: "scan_diff",
            status: "bounced",
            recipient_masked: "b***@example.com",
            attempts: 1,
            created_at: "2026-09-20T12:00:00Z",
            job_id: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
          },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useQuery>);
    renderPage();
    expect(screen.getAllByText("b***@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bounced").length).toBeGreaterThan(0);
    expect(screen.queryByText("error_message")).not.toBeInTheDocument();
    expect(screen.queryByText("SMTP timeout")).not.toBeInTheDocument();
    const links = screen.getAllByTestId("inbox-job-link");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute(
      "href",
      "/scan/bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
    );
  });

  it("F2 status filter offers Bounced and filters via list({status:'bounced'})", async () => {
    const user = userEvent.setup();
    vi.mocked(inboxApi.list).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(useQuery).mockImplementation((opts: unknown) => {
      const queryFn = (opts as { queryFn: () => Promise<unknown> }).queryFn;
      void queryFn();
      return {
        data: { items: [], total: 0 },
        isLoading: false,
      } as ReturnType<typeof useQuery>;
    });
    renderPage();
    expect(
      screen.getByRole("option", { name: "Bounced" }),
    ).toBeInTheDocument();
    const probes = screen.getAllByLabelText("select-probe") as HTMLInputElement[];
    const statusProbe = probes[probes.length - 1];
    await user.click(statusProbe);
    await user.clear(statusProbe);
    await user.type(statusProbe, "bounced");
    expect(inboxApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: "bounced" }),
    );
  });

  it("F3 complained uptime row has no job link", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: {
        total: 1,
        items: [
          {
            id: "c1",
            kind: "uptime",
            status: "complained",
            recipient_masked: "c***@example.com",
            attempts: 1,
            created_at: "2026-09-20T12:00:00Z",
            job_id: null,
          },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useQuery>);
    renderPage();
    expect(screen.getAllByText("c***@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Complained").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("inbox-job-link")).not.toBeInTheDocument();
  });
});
