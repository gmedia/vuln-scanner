import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import CreditHistory from "@/pages/credit/CreditHistory";

const mockFetchBalance = vi.fn();

const mockItems = [
  {
    id: "1",
    amount: 100,
    type: "credit" as const,
    description: "Bonus",
    reference_id: null,
    created_at: "2024-01-15T10:00:00Z",
  },
  {
    id: "2",
    amount: -50,
    type: "deduct" as const,
    description: "IP scan",
    reference_id: null,
    created_at: "2024-01-14T10:00:00Z",
  },
  {
    id: "3",
    amount: 25,
    type: "refund" as const,
    description: "Refund",
    reference_id: null,
    created_at: "2024-01-13T10:00:00Z",
  },
];

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/api/credits", () => ({
  creditApi: { getHistory: vi.fn() },
}));

vi.mock("@/store/creditStore", () => ({
  useCreditStore: Object.assign(
    (selector: (s: { credits: number; fetchBalance: () => void }) => unknown) =>
      selector({ credits: 150, fetchBalance: mockFetchBalance }),
    {
      getState: () => ({ credits: 150, fetchBalance: mockFetchBalance }),
    },
  ),
}));

vi.mock("react-router-dom", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children?: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="card" {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="card-header" {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 data-testid="card-title" {...props}>{children}</h3>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="card-content" {...props}>{children}</div>
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, disabled, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button disabled={disabled} onClick={onClick} {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/Skeleton", () => ({
  Skeleton: ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={className} data-testid="skeleton" {...props} />
  ),
}));

vi.mock("@/components/ui/Input", () => ({
  Input: ({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

import { useQuery } from "@tanstack/react-query";

describe("CreditHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Credit history heading", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByText("Credit history")).toBeInTheDocument();
  });

  it("renders the History icon", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    // History icon renders as an SVG with class containing "lucide-history"
    const svg = document.querySelector("svg.lucide-history");
    expect(svg).toBeInTheDocument();
  });

  it("shows loading skeletons when isLoading is true", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons).toHaveLength(5);
  });

  it("shows 'No transactions yet' when data is undefined", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByText("No transactions yet")).toBeInTheDocument();
  });

  it("shows 'No transactions yet' when items array is empty", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByText("No transactions yet")).toBeInTheDocument();
  });

  it("shows subtitle text in empty state", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(
      screen.getByText("Credit adjustments will appear here.")
    ).toBeInTheDocument();
  });

  it("renders table headers when data is present", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Date",
      "Type",
      "Amount",
      "Description",
    ]);
  });

  it("renders transaction rows with correct data", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByText("Bonus")).toBeInTheDocument();
    expect(screen.getByText("IP scan")).toBeInTheDocument();
    expect(screen.getByText("Refund")).toBeInTheDocument();
  });

  it("displays positive amounts with + prefix", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByText("+100")).toBeInTheDocument();
  });

  it("displays negative amounts without + prefix", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    const amounts = screen.getAllByText("-50");
    expect(amounts.length).toBeGreaterThanOrEqual(1);
    expect(amounts.some((el) => el.tagName === "SPAN")).toBe(true);
  });

  it("displays refund amount with + prefix", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByText("+25")).toBeInTheDocument();
  });

  it("renders type badges for each transaction", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    const creditBadges = screen.getAllByText("credit");
    const deductBadges = screen.getAllByText("deduct");
    const refundBadges = screen.getAllByText("refund");
    expect(creditBadges.length).toBeGreaterThanOrEqual(1);
    expect(deductBadges.length).toBeGreaterThanOrEqual(1);
    expect(refundBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows total count when data is present", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByText("3 total")).toBeInTheDocument();
  });

  it("does not show total count when total is 0", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.queryByText("0 total")).not.toBeInTheDocument();
  });

  it("shows pagination when total exceeds page size", () => {
    const manyItems = Array.from({ length: 20 }, (_, i) => ({
      id: String(i + 1),
      amount: 10,
      type: "credit" as const,
      description: `Transaction ${i + 1}`,
      reference_id: null,
      created_at: "2024-01-15T10:00:00Z",
    }));

    vi.mocked(useQuery).mockReturnValue({
      data: { items: manyItems, total: 25 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("renders pagination buttons when multiple pages exist", () => {
    const manyItems = Array.from({ length: 20 }, (_, i) => ({
      id: String(i + 1),
      amount: 10,
      type: "credit" as const,
      description: `Transaction ${i + 1}`,
      reference_id: null,
      created_at: "2024-01-15T10:00:00Z",
    }));

    vi.mocked(useQuery).mockReturnValue({
      data: { items: manyItems, total: 25 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous page/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next page/i })).toBeInTheDocument();
  });

  it("disables previous button on first page", () => {
    const manyItems = Array.from({ length: 20 }, (_, i) => ({
      id: String(i + 1),
      amount: 10,
      type: "credit" as const,
      description: `Transaction ${i + 1}`,
      reference_id: null,
      created_at: "2024-01-15T10:00:00Z",
    }));

    vi.mocked(useQuery).mockReturnValue({
      data: { items: manyItems, total: 25 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    const prev = screen.getByRole("button", { name: /previous page/i });
    const next = screen.getByRole("button", { name: /next page/i });
    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();
  });

  it("renders transactions inside the Card component", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByTestId("card")).toBeInTheDocument();
    expect(screen.getByTestId("card-header")).toBeInTheDocument();
    expect(screen.getByTestId("card-title")).toBeInTheDocument();
    expect(screen.getByTestId("card-content")).toBeInTheDocument();
  });

  it("renders Transactions heading in card", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByText("Transactions")).toBeInTheDocument();
  });

  it("does not show pagination when only one page exists", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /previous page/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next page/i })).not.toBeInTheDocument();
  });

  it("renders summary strip with balance and period totals", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    const summary = screen.getByTestId("credit-history-summary");
    expect(summary).toBeInTheDocument();
    expect(summary).toHaveTextContent("150");
    expect(summary).toHaveTextContent("Current balance");
    expect(summary).toHaveTextContent("Period credits");
    expect(summary).toHaveTextContent("Period debits");
    expect(mockFetchBalance).toHaveBeenCalled();
  });

  it("renders client-side filters", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    const filters = screen.getByTestId("credit-history-filters");
    expect(filters).toBeInTheDocument();
    expect(screen.getByLabelText("Type")).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search description")).toBeInTheDocument();
    expect(screen.getByText("Filters apply to the current page")).toBeInTheDocument();
  });

  it("renders description as link when reference_id is present", () => {
    const itemsWithRef = [
      {
        id: "10",
        amount: -50,
        type: "deduct" as const,
        description: "IP scan job",
        reference_id: "scan-abc",
        created_at: "2024-01-15T10:00:00Z",
      },
    ];

    vi.mocked(useQuery).mockReturnValue({
      data: { items: itemsWithRef, total: 1 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    const link = screen.getByRole("link", { name: "IP scan job" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/scan/scan-abc");
  });
});
