import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";
import AdminHpp from "@/pages/admin/AdminHpp";

// The calendar widget has its own suite; here we only exercise the write path.
vi.mock("@/components/ui/DatePicker", () => ({
  DatePicker: ({
    id,
    value,
    onChange,
    placeholder,
    "aria-label": ariaLabel,
  }: {
    id?: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    "aria-label"?: string;
  }) => (
    <input
      id={id}
      data-testid={id}
      aria-label={ariaLabel ?? placeholder}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
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

const RATE = {
  key: "ip",
  amount_idr: 1000,
  updated_at: "2026-08-01T00:00:00Z",
  updated_by: null,
};

const OVERHEAD = {
  amount_idr: 5000,
  updated_at: "2026-08-01T00:00:00Z",
  updated_by: null,
};

const REPORT = {
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
  line_margins: [],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminHpp />
    </QueryClientProvider>,
  );
}

describe("AdminHpp write paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getHppRates).mockResolvedValue([RATE] as never);
    vi.mocked(adminApi.getHppOverhead).mockResolvedValue(OVERHEAD as never);
    vi.mocked(adminApi.getHppReport).mockResolvedValue(REPORT as never);
    vi.mocked(adminApi.listHppCosts).mockResolvedValue([] as never);
    vi.mocked(adminApi.updateHppRate).mockResolvedValue(RATE as never);
    vi.mocked(adminApi.updateHppOverhead).mockResolvedValue(
      OVERHEAD as never,
    );
    vi.mocked(adminApi.createHppCost).mockResolvedValue({} as never);
    vi.mocked(adminApi.deleteHppCost).mockResolvedValue(undefined);
  });

  it("saves a changed rate and stays disabled when unchanged", async () => {
    const user = userEvent.setup();
    renderPage();

    // desktop table renders before the mobile cards in the DOM
    const rateInput = (await screen.findAllByLabelText("ip"))[0] as HTMLElement;
    const row = rateInput.closest("tr");
    expect(row).not.toBeNull();
    const save = within(row as HTMLElement).getByRole("button");
    expect(save).toBeDisabled();

    await user.clear(rateInput);
    await user.type(rateInput, "2500");
    await waitFor(() => expect(save).toBeEnabled());

    await user.click(save);
    await waitFor(() =>
      expect(adminApi.updateHppRate).toHaveBeenCalledWith("ip", {
        amount_idr: 2500,
      }),
    );
  });

  it("saves the monthly overhead", async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText("Amount (IDR / month)");
    await user.clear(input);
    await user.type(input, "7500");

    const card = screen.getByTestId("hpp-overhead-card");
    const save = within(card).getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());

    await user.click(save);
    await waitFor(() =>
      expect(adminApi.updateHppOverhead).toHaveBeenCalledWith({
        amount_idr: 7500,
      }),
    );
  });

  it("creates a cost line only when a date is set", async () => {
    const user = userEvent.setup();
    renderPage();

    const card = screen.getByTestId("hpp-costs-card");
    const add = within(card).getByRole("button", { name: "Add line" });
    expect(add).toBeDisabled();

    await user.type(within(card).getByLabelText("Date"), "2026-08-15");
    await user.type(within(card).getByLabelText("Amount (IDR)"), "42000");
    await user.type(within(card).getByLabelText("Note"), "bandwidth");

    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);

    await waitFor(() =>
      expect(adminApi.createHppCost).toHaveBeenCalledWith({
        incurred_on: "2026-08-15",
        amount_idr: 42000,
        category: "opex",
        note: "bandwidth",
      }),
    );
  });

  it("deletes a cost line only after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listHppCosts).mockResolvedValue([
      {
        id: "c1",
        incurred_on: "2026-08-15",
        amount_idr: 42000,
        category: "opex",
        note: "bandwidth",
        created_at: "",
        created_by: null,
      },
    ] as never);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete line" }));
    expect(adminApi.deleteHppCost).not.toHaveBeenCalled();

    await user.click(await screen.findByTestId("hpp-cost-delete-confirm-c1"));
    await waitFor(() =>
      expect(adminApi.deleteHppCost).toHaveBeenCalledWith("c1"),
    );
  });
});
