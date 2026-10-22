import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import BillingProfileCard from "@/components/subscription/BillingProfileCard";
import {
  addBillingRecipient,
  getBillingProfile,
  removeBillingRecipient,
  saveBillingProfile,
  type BillingProfile,
} from "@/api/billingProfile";

vi.mock("@/api/billingProfile", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/billingProfile")>(
      "@/api/billingProfile",
    );
  return {
    ...actual,
    getBillingProfile: vi.fn(),
    saveBillingProfile: vi.fn(),
    addBillingRecipient: vi.fn(),
    removeBillingRecipient: vi.fn(),
  };
});

function profile(overrides: Partial<BillingProfile> = {}): BillingProfile {
  return {
    organization_id: "org-a",
    legal_name: "PT Contoh",
    tax_id: "0123456789012345",
    nitku: "",
    address_line1: "",
    address_line2: "",
    city: "Jakarta",
    province: "",
    postal_code: "",
    country: "ID",
    billing_email: "finance@example.com",
    po_required: true,
    po_number: "PO-1",
    payment_terms_days: 30,
    pkp_status: "pkp",
    recipients: [
      {
        id: "rec-1",
        email: "ap@example.com",
        kind: "billing",
        is_primary: true,
        verified_at: null,
      },
    ],
    ...overrides,
  };
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BillingProfileCard orgId="org-a" />
    </QueryClientProvider>,
  );
}

describe("BillingProfileCard", () => {
  beforeEach(() => {
    vi.mocked(getBillingProfile).mockReset();
    vi.mocked(saveBillingProfile).mockReset();
    vi.mocked(addBillingRecipient).mockReset();
    vi.mocked(removeBillingRecipient).mockReset();
    vi.mocked(getBillingProfile).mockResolvedValue(profile());
    vi.mocked(saveBillingProfile).mockResolvedValue(profile());
    vi.mocked(addBillingRecipient).mockResolvedValue({
      id: "rec-2",
      email: "controller@example.com",
      kind: "billing",
      is_primary: false,
      verified_at: null,
    });
    vi.mocked(removeBillingRecipient).mockResolvedValue();
  });

  it("loads the profile into the form", async () => {
    renderCard();

    expect(await screen.findByTestId("billing-legal-name")).toHaveValue(
      "PT Contoh",
    );
    expect(screen.getByTestId("billing-tax-id")).toHaveValue("0123456789012345");
    expect(screen.getByTestId("billing-email")).toHaveValue(
      "finance@example.com",
    );
    expect(screen.getByText("ap@example.com")).toBeInTheDocument();
  });

  it("saves edited billing details", async () => {
    const user = userEvent.setup();
    renderCard();

    const legalName = await screen.findByTestId("billing-legal-name");
    await user.clear(legalName);
    await user.type(legalName, "PT Baru");
    await user.click(screen.getByTestId("billing-profile-save"));

    await waitFor(() =>
      expect(saveBillingProfile).toHaveBeenCalledWith(
        "org-a",
        expect.objectContaining({
          legal_name: "PT Baru",
          payment_terms_days: 30,
          po_required: true,
        }),
      ),
    );
  });

  it("adds a billing recipient", async () => {
    const user = userEvent.setup();
    renderCard();

    await screen.findByTestId("billing-recipient-input");
    await user.type(
      screen.getByTestId("billing-recipient-input"),
      "controller@example.com",
    );
    await user.click(screen.getByTestId("billing-recipient-add"));

    await waitFor(() =>
      expect(addBillingRecipient).toHaveBeenCalledWith("org-a", {
        email: "controller@example.com",
      }),
    );
  });

  it("removes a billing recipient", async () => {
    const user = userEvent.setup();
    renderCard();

    await screen.findByText("ap@example.com");
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(removeBillingRecipient).toHaveBeenCalledWith("org-a", "rec-1"),
    );
  });

  it("renders a load error instead of an empty form", async () => {
    vi.mocked(getBillingProfile).mockRejectedValue(new Error("boom"));
    renderCard();

    expect(
      await screen.findByText("Could not load billing details"),
    ).toBeInTheDocument();
  });
});
