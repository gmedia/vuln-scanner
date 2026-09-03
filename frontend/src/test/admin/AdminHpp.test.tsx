import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminHpp from "@/pages/admin/AdminHpp";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: {
    getHppRates: vi.fn(),
    updateHppRate: vi.fn(),
    getHppReport: vi.fn(),
    getHppOverhead: vi.fn(),
    updateHppOverhead: vi.fn(),
    listHppCosts: vi.fn(),
    createHppCost: vi.fn(),
    deleteHppCost: vi.fn(),
    quoteHpp: vi.fn(),
  },
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, ...props }: { children?: React.ReactNode }) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardHeader: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children?: React.ReactNode }) => (
    <h3>{children}</h3>
  ),
  CardContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/Input", () => ({
  Input: ({
    value,
    onChange,
    ...props
  }: {
    value?: string | number;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
  }) => <input value={value} onChange={onChange} {...props} />,
}));

vi.mock("@/components/ui/Label", () => ({
  Label: ({ children, ...props }: { children?: React.ReactNode }) => (
    <label {...props}>{children}</label>
  ),
}));

vi.mock("@/components/ui/Badge", () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@/components/ui/Skeleton", () => ({
  TableRowSkeleton: ({ rows = 5 }: { rows?: number }) => (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} data-testid="skeleton" />
      ))}
    </div>
  ),
}));

vi.mock("@/components/ui/Select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/DatePicker", () => ({
  DatePicker: ({
    id,
    value,
    onChange,
  }: {
    id?: string;
    value?: string;
    onChange?: (v: string) => void;
  }) => (
    <input
      id={id}
      data-testid={id}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

vi.mock("@/components/ui/Table", () => ({
  Table: ({ children }: { children?: React.ReactNode }) => (
    <table>{children}</table>
  ),
  TableHeader: ({ children }: { children?: React.ReactNode }) => (
    <thead>{children}</thead>
  ),
  TableBody: ({ children }: { children?: React.ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  TableRow: ({ children }: { children?: React.ReactNode }) => (
    <tr>{children}</tr>
  ),
  TableHead: ({ children }: { children?: React.ReactNode }) => (
    <th>{children}</th>
  ),
  TableCell: ({ children }: { children?: React.ReactNode }) => (
    <td>{children}</td>
  ),
}));

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

vi.mocked(useQueryClient).mockReturnValue({
  invalidateQueries: vi.fn(),
} as never);

const rates = [
  {
    key: "ip",
    amount_idr: 1000,
    updated_at: "2026-08-01T00:00:00Z",
    updated_by: null,
  },
];

const report = {
  from_date: "2026-08-01T00:00:00Z",
  to_date: "2026-08-31T23:59:59Z",
  lines: [
    {
      key: "ip",
      count: 2,
      rate_idr: 1000,
      hpp_idr: 2000,
      overhead_share_idr: 100,
      fully_loaded_hpp_idr: 2100,
      fully_loaded_unit_idr: 1050,
    },
  ],
  total_count: 2,
  total_hpp_idr: 2000,
  overhead_idr: 100,
  journal_opex_idr: 0,
  journal_variable_idr: 0,
  total_fully_loaded_hpp_idr: 2100,
  unallocated_overhead_idr: 0,
  sku_estimates: [
    {
      sku: "basic",
      list_idr: 300000,
      credits_per_month: 10,
      label: "estimasi",
      hpp_if_all_ip_idr: 10000,
      hpp_if_all_domain_idr: 0,
      margin_if_all_ip_idr: 290000,
      margin_if_all_domain_idr: 300000,
      margin_if_all_ip_pct: 97,
      margin_if_all_domain_pct: 100,
    },
  ],
};

describe("AdminHpp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("shows empty rates copy", () => {
    vi.mocked(useQuery).mockImplementation((opts) => {
      const key = (opts.queryKey as readonly unknown[])[0];
      if (key === "admin-hpp") {
        return { data: [], isLoading: false } as never;
      }
      if (key === "admin-hpp-overhead") {
        return {
          data: {
            amount_idr: 0,
            updated_at: "2026-08-01T00:00:00Z",
            updated_by: null,
          },
          isLoading: false,
        } as never;
      }
      if (key === "admin-hpp-costs") {
        return { data: [], isLoading: false } as never;
      }
      return { data: report, isLoading: false } as never;
    });
    render(<AdminHpp />);
    expect(
      screen.getByText("No HPP rates yet. Run migrations to seed keys."),
    ).toBeInTheDocument();
  });

  it("renders rates, report total, and estimasi SKU", () => {
    vi.mocked(useQuery).mockImplementation((opts) => {
      const key = (opts.queryKey as readonly unknown[])[0];
      if (key === "admin-hpp") {
        return { data: rates, isLoading: false } as never;
      }
      if (key === "admin-hpp-overhead") {
        return {
          data: {
            amount_idr: 100,
            updated_at: "2026-08-01T00:00:00Z",
            updated_by: null,
          },
          isLoading: false,
        } as never;
      }
      if (key === "admin-hpp-costs") {
        return { data: [], isLoading: false } as never;
      }
      return { data: report, isLoading: false } as never;
    });
    render(<AdminHpp />);
    expect(screen.getByText("HPP")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Production cost (IDR). Pricing = credits/scan. Not mixed.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Variable cost per scan type (not list price). Pricing sets credits.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "HPP = rate × volume. Fully loaded = HPP + overhead pool share (singleton + journal).",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByDisplayValue(1000).length).toBeGreaterThan(0);
    expect(screen.getByTestId("hpp-report-filters")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-overhead-card")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-quote-card")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-costs-card")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-sku-basic")).toBeInTheDocument();
    expect(screen.getByText("estimasi")).toBeInTheDocument();
    expect(screen.getByText(/Margin if all IP/)).toBeInTheDocument();
    expect(screen.getByText(/290.000/)).toBeInTheDocument();
    expect(screen.getByText(/\(97%\)/)).toBeInTheDocument();
  });
});
