import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  InvoicePrintSheet,
  type InvoicePrintData,
} from "@/components/invoice/InvoicePrintSheet";

const sent: InvoicePrintData = {
  number: "SX-202609-0001",
  sku: "basic",
  product: "scan",
  amount_idr: 300000,
  period_start: "2026-09-01T00:00:00Z",
  period_end: "2026-09-30T23:59:59Z",
  status: "sent",
  bank_ref: null,
  organization_name: "Hotel Example",
  bank: {
    bank_name: "Bank Contoh",
    bank_account: "0000000000",
    bank_holder: "Acme Holder",
  },
};

const paid: InvoicePrintData = {
  ...sent,
  number: "SX-202609-0004",
  status: "paid",
  bank_ref: "TRX-1",
  bank: {
    bank_name: "Bank Contoh",
    bank_account: "SHOULD-NOT-PRINT",
    bank_holder: "Acme Holder",
  },
};

describe("InvoicePrintSheet", () => {
  it("renders a receipt header, parties, line table, and totals for a sent invoice", () => {
    render(<InvoicePrintSheet invoice={sent} billTo="Hotel Example" />);

    const sheet = screen.getByTestId("invoice-print-sheet");
    expect(sheet).toBeInTheDocument();
    expect(sheet.querySelector(".invoice-print-brand")).toHaveTextContent(
      "SINEXIS",
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Hotel Example")).toBeInTheDocument();
    expect(screen.getByText("Sinexis")).toBeInTheDocument();
    expect(screen.getByText("SX-202609-0001")).toBeInTheDocument();
    expect(screen.getAllByText("Rp 300.000").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(screen.getByTestId("invoice-print-bank")).toHaveTextContent(
      "0000000000",
    );
    expect(screen.getByTestId("invoice-print-bank")).toHaveTextContent(
      "Bank Contoh",
    );
  });

  it("omits the bank block and account on a paid invoice", () => {
    render(<InvoicePrintSheet invoice={paid} />);

    expect(screen.getByTestId("invoice-print-sheet")).toBeInTheDocument();
    expect(screen.queryByTestId("invoice-print-bank")).not.toBeInTheDocument();
    expect(screen.queryByText("SHOULD-NOT-PRINT")).not.toBeInTheDocument();
    expect(screen.getByText("TRX-1")).toBeInTheDocument();
  });

  it("renders nothing when invoice is null", () => {
    const { container } = render(<InvoicePrintSheet invoice={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
