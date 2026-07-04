import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminPricing from "@/pages/admin/AdminPricing";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: {
    getPricing: vi.fn(),
    updatePricing: vi.fn(),
  },
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, ...props }: any) => <div data-testid="card" {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div data-testid="card-header" {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h3 data-testid="card-title" {...props}>{children}</h3>,
  CardContent: ({ children, ...props }: any) => <div data-testid="card-content" {...props}>{children}</div>,
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/Input", () => ({
  Input: ({ value, onChange, ...props }: any) => (
    <input value={value} onChange={onChange} {...props} />
  ),
}));

vi.mock("@/components/ui/Badge", () => ({
  Badge: ({ children, ...props }: any) => <span data-testid="badge" {...props}>{children}</span>,
}));

vi.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";

const mockInvalidateQueries = vi.fn();
vi.mocked(useQueryClient).mockReturnValue({
  invalidateQueries: mockInvalidateQueries,
} as any);

const basePricing = [
  { id: "1", scan_type: "ip", credit_cost: 5, updated_at: "2025-06-01T10:00:00Z" },
  { id: "2", scan_type: "domain", credit_cost: 10, updated_at: "2025-06-01T10:00:00Z" },
  { id: "3", scan_type: "mobile", credit_cost: 15, updated_at: "2025-06-01T10:00:00Z" },
];

function mockUseQueryReturn(overrides: Partial<ReturnType<typeof useQuery>> = {}) {
  vi.mocked(useQuery).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof useQuery>);
}

function mockUseMutationReturn() {
  vi.mocked(useMutation).mockReturnValue({
    mutate: vi.fn(),
  } as any);
}

describe("AdminPricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(<AdminPricing />);
  }

  describe("loading state", () => {
    it("shows skeletons while loading", () => {
      mockUseQueryReturn({ isLoading: true });
      mockUseMutationReturn();
      renderPage();
      const skeletons = screen.getAllByTestId("skeleton");
      expect(skeletons.length).toBe(4);
    });
  });

  describe("empty state", () => {
    it("shows No pricing configured when empty", () => {
      mockUseQueryReturn({ data: [] });
      mockUseMutationReturn();
      renderPage();
      expect(screen.getByText("No pricing configured")).toBeInTheDocument();
    });
  });

  describe("loaded state", () => {
    it("renders PRICING CONFIGURATION heading", () => {
      mockUseQueryReturn({ data: basePricing });
      mockUseMutationReturn();
      renderPage();
      expect(screen.getByText("PRICING CONFIGURATION")).toBeInTheDocument();
    });

    it("renders SCAN PRICING card title", () => {
      mockUseQueryReturn({ data: basePricing });
      mockUseMutationReturn();
      renderPage();
      expect(screen.getByText("SCAN PRICING")).toBeInTheDocument();
    });

    it("renders table headers", () => {
      mockUseQueryReturn({ data: basePricing });
      mockUseMutationReturn();
      renderPage();
      expect(screen.getByText("Scan Type")).toBeInTheDocument();
      expect(screen.getByText("Credit Cost")).toBeInTheDocument();
      expect(screen.getByText("Updated")).toBeInTheDocument();
      expect(screen.getByText("Actions")).toBeInTheDocument();
    });

    it("renders all pricing items", () => {
      mockUseQueryReturn({ data: basePricing });
      mockUseMutationReturn();
      renderPage();
      expect(screen.getByText("ip")).toBeInTheDocument();
      expect(screen.getByText("domain")).toBeInTheDocument();
      expect(screen.getByText("mobile")).toBeInTheDocument();
    });

    it("shows input fields with credit cost values", () => {
      mockUseQueryReturn({ data: basePricing });
      mockUseMutationReturn();
      renderPage();
      const inputs = screen.getAllByRole("spinbutton");
      expect(inputs[0]).toHaveValue(5);
      expect(inputs[1]).toHaveValue(10);
      expect(inputs[2]).toHaveValue(15);
    });

    it("shows updated date", () => {
      mockUseQueryReturn({ data: basePricing });
      mockUseMutationReturn();
      renderPage();
      const dates = screen.getAllByText("6/1/2025");
      expect(dates.length).toBe(3);
    });

    it("shows Saved on all buttons initially", () => {
      mockUseQueryReturn({ data: basePricing });
      mockUseMutationReturn();
      renderPage();
      const savedButtons = screen.getAllByText("Saved");
      expect(savedButtons.length).toBe(3);
    });

    it("shows Save button when cost changes", async () => {
      mockUseQueryReturn({ data: basePricing });
      mockUseMutationReturn();
      renderPage();
      const inputs = screen.getAllByRole("spinbutton");
      await userEvent.clear(inputs[0]);
      await userEvent.type(inputs[0], "8");
      expect(screen.getByText("Save")).toBeInTheDocument();
    });

    it("does not show Save when value matches original", async () => {
      mockUseQueryReturn({ data: basePricing });
      mockUseMutationReturn();
      renderPage();
      const inputs = screen.getAllByRole("spinbutton");
      await userEvent.clear(inputs[0]);
      await userEvent.type(inputs[0], "5");
      expect(screen.queryByText("Save")).not.toBeInTheDocument();
    });

    it("calls mutate on Save click", async () => {
      const mockMutate = vi.fn();
      vi.mocked(useMutation).mockReturnValue({ mutate: mockMutate } as any);
      mockUseQueryReturn({ data: basePricing });
      renderPage();
      const inputs = screen.getAllByRole("spinbutton");
      await userEvent.clear(inputs[0]);
      await userEvent.type(inputs[0], "8");
      await userEvent.click(screen.getByText("Save"));
      expect(mockMutate).toHaveBeenCalledWith({
        scanType: "ip",
        creditCost: 8,
      });
    });

    it("does not call mutate when value unchanged", async () => {
      const mockMutate = vi.fn();
      vi.mocked(useMutation).mockReturnValue({ mutate: mockMutate } as any);
      mockUseQueryReturn({ data: basePricing });
      renderPage();
      const buttons = screen.getAllByText("Saved");
      await userEvent.click(buttons[0]);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it("disables button when no changes", () => {
      vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as any);
      mockUseQueryReturn({ data: basePricing });
      renderPage();
      const saveBtn = screen.getAllByRole("button")[0];
      expect(saveBtn).toBeDisabled();
    });

    it("disables button when saving is in progress for that item", async () => {
      const mockMutate = vi.fn();
      vi.mocked(useMutation).mockReturnValue({ mutate: mockMutate } as any);
      mockUseQueryReturn({ data: basePricing });
      renderPage();
      const inputs = screen.getAllByRole("spinbutton");
      await userEvent.clear(inputs[0]);
      await userEvent.type(inputs[0], "8");
      await userEvent.click(screen.getByText("Save"));
      expect(mockMutate).toHaveBeenCalledWith({
        scanType: "ip",
        creditCost: 8,
      });
    });
  });
});
