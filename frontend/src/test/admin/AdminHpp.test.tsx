import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { adminApi } from "@/api/admin";
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
  catalog_seed_skus: [],
  line_margins: [
    {
      line: "scan",
      label: "estimasi",
      org_count: 1,
      revenue_idr: 300000,
      cogs_idr: 10000,
      margin_idr: 290000,
      margin_pct: 97,
      unpriced_org_count: 0,
    },
    {
      line: "host",
      label: "estimasi",
      org_count: 1,
      revenue_idr: 900000,
      cogs_idr: 250,
      margin_idr: 899750,
      margin_pct: 100,
      host_cogs_capped: true,
      host_scans_raw: 3,
      host_scans_cap: 1,
      unpriced_org_count: 0,
    },
    {
      line: "uptime",
      label: "estimasi",
      org_count: 2,
      revenue_idr: 150000,
      cogs_idr: 15,
      margin_idr: 149985,
      margin_pct: 100,
      unpriced_org_count: 0,
    },
    {
      line: "guard",
      label: "estimasi",
      org_count: 1,
      revenue_idr: 100000,
      cogs_idr: 2000,
      margin_idr: 98000,
      margin_pct: 98,
      unpriced_org_count: 0,
    },
  ],
};

describe("AdminHpp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("renders a collapsible usage guide", async () => {
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
    const user = userEvent.setup();
    render(<AdminHpp />);
    expect(screen.getByTestId("hpp-guide")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Enter the real per-unit cost (COGS) in the Unit rates card, then Save each key.",
      ),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Steps" }));
    expect(
      await screen.findByText(
        "Enter the real per-unit cost (COGS) in the Unit rates card, then Save each key.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limits" }));
    expect(
      await screen.findByText(
        "The report is a cost and margin estimate, not invoice profit.",
      ),
    ).toBeInTheDocument();
  });

  it("asks before deleting a cost line", async () => {
    const user = userEvent.setup();
    const costLine = {
      id: "cost-1",
      incurred_on: "2026-08-01",
      category: "opex",
      amount_idr: 1000,
      note: "Hosting",
    };
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
        return { data: [costLine], isLoading: false } as never;
      }
      return { data: report, isLoading: false } as never;
    });
    vi.mocked(useMutation).mockImplementation(
      (opts) =>
        ({
          mutate: (id: string) =>
            void (opts.mutationFn as (id: string) => Promise<unknown>)(id),
        }) as never,
    );

    render(<AdminHpp />);
    await user.click(screen.getByLabelText("Delete line"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(adminApi.deleteHppCost).not.toHaveBeenCalled();

    await user.click(
      screen.getByTestId(`hpp-cost-delete-confirm-${costLine.id}`),
    );
    expect(adminApi.deleteHppCost).toHaveBeenCalledWith(costLine.id);
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
        "Production cost (IDR). Scan is metered by SKU seats, not credits.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Variable cost per scan type (not per-seat SKU list price).",
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
    expect(screen.getByTestId("hpp-costs-card")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-line-scan")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-line-host")).toBeInTheDocument();
    expect(screen.getByText("Report range")).toBeInTheDocument();
    const costs = screen.getByTestId("hpp-costs-card");
    const labels = Array.from(costs.querySelectorAll("label")).map(
      (el) => el.textContent,
    );
    expect(labels.slice(0, 4)).toEqual([
      "Date",
      "Category",
      "Amount (IDR)",
      "Note",
    ]);
    expect(screen.getAllByText("estimasi").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Margin \(estimasi\)/).length).toBe(4);
    expect(screen.getByText(/290.000/)).toBeInTheDocument();
    expect(screen.getByText(/\(97%\)/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Host COGS capped at included cadence (1 scans vs 3 recorded).",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Cost / unit (IDR)")).toBeInTheDocument();
    expect(
      screen.getByText(
        "These are production costs (COGS) per completed job — not selling prices. The line-margin cards compute revenue from the SKU list price in the catalog.",
      ),
    ).toBeInTheDocument();
  });

  it("labels each of the four line-margin cards", () => {
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
    const scanCard = screen.getByTestId("hpp-line-scan");
    const hostCard = screen.getByTestId("hpp-line-host");
    const uptimeCard = screen.getByTestId("hpp-line-uptime");
    const guardCard = screen.getByTestId("hpp-line-guard");
    expect(scanCard).toBeInTheDocument();
    expect(hostCard).toBeInTheDocument();
    expect(uptimeCard).toBeInTheDocument();
    expect(guardCard).toBeInTheDocument();
    expect(uptimeCard).toHaveTextContent("Uptime");
    expect(guardCard).toHaveTextContent("Guard");
  });

  it("shows cost-not-filled instead of 100% when cogs is zero", () => {
    const zeroCogsReport = {
      ...report,
      line_margins: [
        {
          ...report.line_margins[0],
          cogs_idr: 0,
          revenue_idr: 300000,
          margin_idr: 300000,
          margin_pct: 100,
        },
        { ...report.line_margins[1], margin_pct: 99 },
      ],
    };
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
      return { data: zeroCogsReport, isLoading: false } as never;
    });
    render(<AdminHpp />);
    expect(screen.queryByText(/\(100%\)/)).toBeNull();
    expect(screen.getByText(/cost not filled in/)).toBeInTheDocument();
  });

  it("shows enterprise unpriced note", () => {
    const unpricedReport = {
      ...report,
      line_margins: [
        { ...report.line_margins[0], unpriced_org_count: 2 },
        report.line_margins[1],
      ],
    };
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
      return { data: unpricedReport, isLoading: false } as never;
    });
    render(<AdminHpp />);
    expect(
      screen.getByText(
        "Enterprise orgs are quote-only (no public list price) and excluded from this estimasi: 2 org.",
      ),
    ).toBeInTheDocument();
  });

  it("warns when list prices are seeded", () => {
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
      return {
        data: { ...report, catalog_seed_skus: ["scan:basic"] },
        isLoading: false,
      } as never;
    });
    render(<AdminHpp />);
    expect(
      screen.getByText(
        "Some SKU list prices fall back to built-in seed constants (no catalog row): scan:basic.",
      ),
    ).toBeInTheDocument();
  });

  it("rails each HPP shell by its role", () => {
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
    expect(
      screen.getByTestId("hpp-rates-card").querySelector(".bg-primary"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("hpp-overhead-card").querySelector(".bg-amber-600"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("hpp-costs-card").querySelector(".bg-amber-600"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("hpp-report-filters").querySelector(".bg-sky-600"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("hpp-report-card").querySelector(".bg-primary"),
    ).toBeTruthy();
  });

  it("rails line-margin shells primary when margin is positive", () => {
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
    expect(
      screen.getByTestId("hpp-line-scan").querySelector(".bg-primary"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("hpp-line-host").querySelector(".bg-primary"),
    ).toBeTruthy();
  });

  it("rails a negative-margin line destructive", () => {
    const lossReport = {
      ...report,
      line_margins: [
        {
          line: "scan",
          label: "estimasi",
          org_count: 1,
          revenue_idr: 100,
          cogs_idr: 900,
          margin_idr: -800,
          margin_pct: -800,
        },
      ],
    };
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
      return { data: lossReport, isLoading: false } as never;
    });
    render(<AdminHpp />);
    expect(
      screen.getByTestId("hpp-line-scan").querySelector(".bg-destructive"),
    ).toBeTruthy();
  });

  it("rails the report shell amber when overhead is unallocated", () => {
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
      return {
        data: { ...report, unallocated_overhead_idr: 5000 },
        isLoading: false,
      } as never;
    });
    render(<AdminHpp />);
    expect(
      screen.getByTestId("hpp-report-card").querySelector(".bg-amber-600"),
    ).toBeTruthy();
  });
});
