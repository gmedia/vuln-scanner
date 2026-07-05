import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import CreditHistory from "@/pages/credit/CreditHistory";

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

import { useQuery } from "@tanstack/react-query";

describe("CreditHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the CREDIT HISTORY heading", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByText("CREDIT HISTORY")).toBeInTheDocument();
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
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
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
    expect(screen.getByText("-50")).toBeInTheDocument();
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
    expect(screen.getByText("credit")).toBeInTheDocument();
    expect(screen.getByText("deduct")).toBeInTheDocument();
    expect(screen.getByText("refund")).toBeInTheDocument();
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
    // ChevronLeft and ChevronRight icons render as SVGs inside buttons
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
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
    const buttons = screen.getAllByRole("button");
    // First button is "previous" (ChevronLeft)
    expect(buttons[0]).toBeDisabled();
    // Second button is "next" (ChevronRight)
    expect(buttons[1]).not.toBeDisabled();
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

  it("renders TRANSACTIONS heading in card", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.getByText("TRANSACTIONS")).toBeInTheDocument();
  });

  it("does not show pagination when only one page exists", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { items: mockItems, total: 3 },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<CreditHistory />);
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
