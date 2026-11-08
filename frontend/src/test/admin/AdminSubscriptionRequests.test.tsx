import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AdminSubscriptionRequests from "@/pages/admin/AdminSubscriptionRequests";
import { tierFixtures } from "@/test/fixtures/skuTiers";
import {
  approveAdminSubscriptionRequest,
  listAdminSubscriptionRequests,
  rejectAdminSubscriptionRequest,
  type SubscriptionRequestItem,
} from "@/api/subscription";

vi.mock("@/api/subscription", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/subscription")>(
      "@/api/subscription",
    );
  return {
    ...actual,
    listAdminSubscriptionRequests: vi.fn(),
    approveAdminSubscriptionRequest: vi.fn(),
    rejectAdminSubscriptionRequest: vi.fn(),
    getSkuTiers: vi.fn(async () => tierFixtures),
  };
});

const request: SubscriptionRequestItem = {
  id: "req-1",
  organization_id: "org-a",
  direction: "upgrade",
  current_sku: "pro",
  target_sku: "multi",
  cycle: "annual",
  note: "Need 10 assets",
  status: "pending",
  resolution_note: "",
  created_at: "2026-10-19T00:00:00Z",
  resolved_at: null,
  organization_name: "Org A",
  requested_by_email: "owner@example.com",
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/admin/subscription-requests"]}>
        <AdminSubscriptionRequests />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminSubscriptionRequests", () => {
  beforeEach(() => {
    vi.mocked(listAdminSubscriptionRequests).mockReset();
    vi.mocked(approveAdminSubscriptionRequest).mockReset();
    vi.mocked(rejectAdminSubscriptionRequest).mockReset();
    vi.mocked(listAdminSubscriptionRequests).mockResolvedValue({
      items: [request],
      total: 1,
    });
    vi.mocked(approveAdminSubscriptionRequest).mockResolvedValue({
      ...request,
      status: "approved",
      resolution_note: "",
    });
    vi.mocked(rejectAdminSubscriptionRequest).mockResolvedValue({
      ...request,
      status: "rejected",
      resolution_note: "Not now",
    });
  });

  it("lists pending requests and approves one", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByTestId("subscription-requests-guide")).toBeInTheDocument();
    const table = await screen.findByTestId("admin-subscription-requests-table");
    expect(within(table).getByText("Org A")).toBeInTheDocument();
    expect(within(table).getByText("Pro → Multi")).toBeInTheDocument();
    await user.click(screen.getByTestId("admin-subscription-approve-req-1"));

    await waitFor(() =>
      expect(approveAdminSubscriptionRequest).toHaveBeenCalledWith("req-1", ""),
    );
  });

  it("rejects a request with a note", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("admin-subscription-requests-table");
    await user.click(screen.getByTestId("admin-subscription-reject-req-1"));
    expect(
      await screen.findByText("Reject this request?"),
    ).toBeInTheDocument();
    await user.type(
      screen.getByTestId("admin-subscription-reject-note"),
      "Not now",
    );
    await user.click(screen.getByTestId("admin-subscription-reject-submit"));

    await waitFor(() =>
      expect(rejectAdminSubscriptionRequest).toHaveBeenCalledWith(
        "req-1",
        "Not now",
      ),
    );
  });

  it("renders the empty state", async () => {
    vi.mocked(listAdminSubscriptionRequests).mockResolvedValue({
      items: [],
      total: 0,
    });
    renderPage();
    expect(
      await screen.findByTestId("admin-subscription-requests-empty"),
    ).toBeInTheDocument();
  });

  it("requests page 2 and renders the matching slice count", async () => {
    const user = userEvent.setup();
    vi.mocked(listAdminSubscriptionRequests).mockImplementation(
      async (params) => {
        const page = params?.page ?? 1;
        const items = Array.from({ length: 50 }, (_, i) => ({
          ...request,
          id: `req-${page}-${i}`,
          organization_name: `Org ${page}-${i}`,
        }));
        return { items, total: 60 };
      },
    );

    renderPage();
    await screen.findByTestId("admin-subscription-requests-table");
    expect(screen.getByTestId("subscription-requests-range")).toHaveTextContent(
      "Showing 1–50 of 60",
    );

    await user.click(screen.getByTestId("subscription-requests-next"));

    await waitFor(() =>
      expect(listAdminSubscriptionRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, page_size: 50 }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("subscription-requests-range")).toHaveTextContent(
        "Showing 51–60 of 60",
      ),
    );
  });
});
