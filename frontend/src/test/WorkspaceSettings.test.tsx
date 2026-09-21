import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import WorkspaceSettings from "@/pages/WorkspaceSettings";
import { listOrgInvoices } from "@/api/orgs";

vi.mock("@/api/orgs", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/orgs")>("@/api/orgs");
  return {
    ...actual,
    listMembers: vi.fn(async () => []),
    listInvites: vi.fn(async () => []),
    listOrgInvoices: vi.fn(async () => ({ items: [], total: 0 })),
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/settings/workspace"]}>
        <WorkspaceSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WorkspaceSettings pilot checklist", () => {
  beforeEach(() => {
    vi.mocked(listOrgInvoices).mockReset();
    vi.mocked(listOrgInvoices).mockResolvedValue({ items: [], total: 0 });
    useAuthStore.setState({
      user: {
        id: "u-1",
        email: "owner@example.com",
        is_verified: true,
        is_admin: false,
        credits: 0,
      },
      activeOrgId: "org-a",
      organizations: [
        {
          id: "org-a",
          name: "Org A",
          slug: "org-a",
          role: "owner",
          kind: "team",
        },
      ],
    });
  });

  it("renders checklist copy and product links", () => {
    renderPage();
    expect(screen.getByTestId("pilot-checklist")).toBeInTheDocument();
    expect(screen.getByText("Pilot checklist")).toBeInTheDocument();
    expect(screen.getByTestId("pilot-link-assets")).toHaveAttribute(
      "href",
      "/assets",
    );
    expect(screen.getByTestId("pilot-link-schedules")).toHaveAttribute(
      "href",
      "/schedules",
    );
    expect(screen.queryByTestId("pilot-link-credits")).not.toBeInTheDocument();
  });

  it("hides checklist when there is no org", () => {
    useAuthStore.setState({ activeOrgId: null, organizations: [] });
    renderPage();
    expect(screen.queryByTestId("pilot-checklist")).not.toBeInTheDocument();
  });

  it("renders PageHeader without in-page account tabs", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 2, name: /workspace/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("account-nav")).not.toBeInTheDocument();
    expect(screen.getByTestId("invite-form-card")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-billing")).toBeInTheDocument();
  });

  it("invite submit says send and keeps copy-link as backup", () => {
    renderPage();
    const submit = screen.getByTestId("invite-submit");
    expect(submit).toHaveTextContent("Send invite");
    expect(submit).not.toHaveTextContent("Create invite");
    expect(screen.getByTestId("invite-form-card")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-link-box")).not.toBeInTheDocument();
    expect(screen.queryByTestId("copy-invite-link")).not.toBeInTheDocument();
  });

  it("explains empty billing without an upgrade CTA", async () => {
    renderPage();
    expect(
      await screen.findByTestId("workspace-billing-empty"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /No invoices yet\. Ops will issue Scan or Host invoices here; there is no self-serve upgrade\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("workspace-billing-admin-link"),
    ).not.toBeInTheDocument();
  });

  it("links platform admin to admin invoices when empty", async () => {
    useAuthStore.setState({
      user: {
        id: "u-admin",
        email: "admin@example.com",
        is_verified: true,
        is_admin: true,
        credits: 0,
      },
    });
    renderPage();
    const link = await screen.findByTestId("workspace-billing-admin-link");
    expect(link).toHaveAttribute("href", "/admin/invoices");
  });

  it("does not paint a load error as empty", async () => {
    vi.mocked(listOrgInvoices).mockRejectedValueOnce(new Error("boom"));
    renderPage();
    expect(
      await screen.findByTestId("workspace-billing-error"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("workspace-billing-empty"),
    ).not.toBeInTheDocument();
  });

  it("shows bank copy on a sent invoice", async () => {
    vi.mocked(listOrgInvoices).mockResolvedValueOnce({
      items: [
        {
          id: "inv-1",
          organization_id: "org-a",
          number: "SX-202609-0001",
          product: "scan",
          sku: "basic",
          amount_idr: 300000,
          period_start: "2026-09-01T00:00:00Z",
          period_end: "2026-09-30T23:59:59Z",
          status: "sent",
          bank_ref: null,
          notes: "",
          paid_at: null,
          created_at: "2026-09-14T00:00:00Z",
          bank: {
            bank_name: "Bank Contoh",
            bank_account: "0000000000",
            bank_holder: "Acme Holder",
          },
        },
      ],
      total: 1,
    });
    renderPage();
    expect(
      await screen.findByText(
        "Transfer to Bank Contoh 0000000000 (Acme Holder)",
      ),
    ).toBeInTheDocument();
  });

  it("shows dashes when sent invoice bank fields are null", async () => {
    vi.mocked(listOrgInvoices).mockResolvedValueOnce({
      items: [
        {
          id: "inv-2",
          organization_id: "org-a",
          number: "SX-202609-0002",
          product: "scan",
          sku: "basic",
          amount_idr: 300000,
          period_start: "2026-09-01T00:00:00Z",
          period_end: "2026-09-30T23:59:59Z",
          status: "sent",
          bank_ref: null,
          notes: "",
          paid_at: null,
          created_at: "2026-09-14T00:00:00Z",
          bank: {
            bank_name: null,
            bank_account: null,
            bank_holder: null,
          },
        },
      ],
      total: 1,
    });
    renderPage();
    expect(await screen.findByText("Transfer to — — (—)")).toBeInTheDocument();
  });

  it("does not show bank copy on a draft invoice", async () => {
    vi.mocked(listOrgInvoices).mockResolvedValueOnce({
      items: [
        {
          id: "inv-3",
          organization_id: "org-a",
          number: "SX-202609-0003",
          product: "scan",
          sku: "basic",
          amount_idr: 300000,
          period_start: "2026-09-01T00:00:00Z",
          period_end: "2026-09-30T23:59:59Z",
          status: "draft",
          bank_ref: null,
          notes: "",
          paid_at: null,
          created_at: "2026-09-14T00:00:00Z",
          bank: null,
        },
      ],
      total: 1,
    });
    renderPage();
    expect(await screen.findByText("SX-202609-0003")).toBeInTheDocument();
    expect(screen.queryByText(/Transfer to/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("invoice-print")).not.toBeInTheDocument();
  });

  it("prints a sent invoice with bank copy on the sheet", async () => {
    const print = vi.fn();
    window.print = print;
    vi.mocked(listOrgInvoices).mockResolvedValueOnce({
      items: [
        {
          id: "inv-1",
          organization_id: "org-a",
          number: "SX-202609-0001",
          product: "scan",
          sku: "basic",
          amount_idr: 300000,
          period_start: "2026-09-01T00:00:00Z",
          period_end: "2026-09-30T23:59:59Z",
          status: "sent",
          bank_ref: null,
          notes: "",
          paid_at: null,
          created_at: "2026-09-14T00:00:00Z",
          bank: {
            bank_name: "Bank Contoh",
            bank_account: "0000000000",
            bank_holder: "Acme Holder",
          },
        },
      ],
      total: 1,
    });
    renderPage();
    await userEvent.click(await screen.findByTestId("invoice-print"));
    expect(screen.getByTestId("invoice-print-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("invoice-print-bank")).toHaveTextContent(
      "0000000000",
    );
    await waitFor(() => expect(print).toHaveBeenCalled());
  });

  it("prints a paid invoice without bank account", async () => {
    const print = vi.fn();
    window.print = print;
    vi.mocked(listOrgInvoices).mockResolvedValueOnce({
      items: [
        {
          id: "inv-4",
          organization_id: "org-a",
          number: "SX-202609-0004",
          product: "scan",
          sku: "basic",
          amount_idr: 300000,
          period_start: "2026-09-01T00:00:00Z",
          period_end: "2026-09-30T23:59:59Z",
          status: "paid",
          bank_ref: "TRX-1",
          notes: "",
          paid_at: "2026-09-15T00:00:00Z",
          created_at: "2026-09-14T00:00:00Z",
          bank: {
            bank_name: "Bank Contoh",
            bank_account: "SHOULD-NOT-PRINT",
            bank_holder: "Acme Holder",
          },
        },
      ],
      total: 1,
    });
    renderPage();
    await userEvent.click(await screen.findByTestId("invoice-print"));
    expect(screen.getByTestId("invoice-print-sheet")).toBeInTheDocument();
    expect(screen.queryByTestId("invoice-print-bank")).not.toBeInTheDocument();
    expect(screen.queryByText("SHOULD-NOT-PRINT")).not.toBeInTheDocument();
    await waitFor(() => expect(print).toHaveBeenCalled());
  });
});
