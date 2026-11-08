import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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
  getHppHistory: vi.fn(),
}));

vi.mock("@/pages/admin/AdminHppSimulator", () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="what-if-embedded" data-embedded={String(embedded)} />
  ),
}));

vi.mock("@/components/admin/HppHistorySheet", () => ({
  default: () => <div data-testid="hpp-history" />,
}));

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

vi.mocked(useQueryClient).mockReturnValue({
  invalidateQueries: vi.fn(),
} as never);

const report = {
  from_date: "2026-08-01T00:00:00Z",
  to_date: "2026-08-31T23:59:59Z",
  lines: [],
  total_count: 0,
  total_hpp_idr: 0,
  overhead_idr: 0,
  journal_opex_idr: 0,
  journal_variable_idr: 0,
  total_fully_loaded_hpp_idr: 0,
  unallocated_overhead_idr: 0,
  catalog_seed_skus: [],
  line_margins: [],
};

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AdminHpp />
    </MemoryRouter>,
  );
}

describe("AdminHpp tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
    vi.mocked(useQuery).mockImplementation((opts) => {
      const key = (opts.queryKey as readonly unknown[])[0];
      if (key === "admin-hpp") return { data: [], isLoading: false } as never;
      if (key === "admin-hpp-overhead") {
        return { data: { amount_idr: 0 }, isLoading: false } as never;
      }
      if (key === "admin-hpp-costs") {
        return { data: [], isLoading: false } as never;
      }
      return { data: report, isLoading: false } as never;
    });
  });

  it("renders both tabs with the report tab selected by default", () => {
    renderAt("/admin/hpp");
    expect(screen.getByTestId("hpp-tab-report")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-tab-what-if")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-guide")).toBeInTheDocument();
    expect(screen.queryByTestId("what-if-embedded")).toBeNull();
  });

  it("opens the What-if tab when it is clicked", async () => {
    const user = userEvent.setup();
    renderAt("/admin/hpp");
    await user.click(screen.getByTestId("hpp-tab-what-if"));
    expect(screen.getByTestId("what-if-embedded")).toHaveAttribute(
      "data-embedded",
      "true",
    );
  });

  it("opens the What-if tab from the ?tab=what-if query param", () => {
    renderAt("/admin/hpp?tab=what-if");
    expect(screen.getByTestId("what-if-embedded")).toHaveAttribute(
      "data-embedded",
      "true",
    );
    expect(screen.queryByTestId("hpp-guide")).toBeNull();
  });
});
