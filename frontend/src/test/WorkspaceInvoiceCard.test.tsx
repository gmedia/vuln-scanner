import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { WorkspaceInvoiceCard } from "@/components/invoice/WorkspaceInvoiceCard";
import type { OrgInvoiceItem } from "@/api/orgs";

function invoice(overrides: Partial<OrgInvoiceItem> = {}): OrgInvoiceItem {
  return {
    id: "inv-1",
    organization_id: "org-a",
    number: "SX-202611-0001",
    product: "scan",
    sku: "pro",
    seats: 1,
    amount_idr: 1_000_000,
    total_idr: 1_000_000,
    period_start: "2026-11-01T00:00:00Z",
    period_end: "2026-11-30T23:59:59Z",
    due_date: "2026-11-15T00:00:00Z",
    status: "sent",
    bank_ref: null,
    notes: "",
    paid_at: null,
    created_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

function renderCard(data: OrgInvoiceItem) {
  return render(
    <MemoryRouter>
      <WorkspaceInvoiceCard
        invoice={data}
        onPrint={vi.fn()}
        onDownload={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("WorkspaceInvoiceCard", () => {
  it("renders a Bayar link for a sent invoice with a total", () => {
    renderCard(invoice());
    const pay = screen.getByTestId("invoice-pay");
    expect(pay).toHaveTextContent("Pay");
    expect(pay.closest("a")).toHaveAttribute("href", "/pay/inv-1");
    expect(screen.getByTestId("invoice-print")).toBeInTheDocument();
    expect(screen.getByTestId("invoice-pdf")).toBeInTheDocument();
  });

  it("hides Bayar for a draft invoice", () => {
    renderCard(invoice({ status: "draft" }));
    expect(screen.queryByTestId("invoice-pay")).not.toBeInTheDocument();
  });

  it("hides Bayar for a paid invoice", () => {
    renderCard(
      invoice({ status: "paid", paid_at: "2026-11-10T08:00:00Z" }),
    );
    expect(screen.queryByTestId("invoice-pay")).not.toBeInTheDocument();
    expect(screen.getByTestId("invoice-print")).toBeInTheDocument();
  });

  it("hides Bayar for a sent invoice with a zero total", () => {
    renderCard(invoice({ total_idr: 0, discount_idr: 1_000_000 }));
    expect(screen.queryByTestId("invoice-pay")).not.toBeInTheDocument();
  });

  it("hides Bayar when the server marks the invoice not payable", () => {
    renderCard(invoice({ can_pay: false }));
    expect(screen.queryByTestId("invoice-pay")).not.toBeInTheDocument();
  });
});
