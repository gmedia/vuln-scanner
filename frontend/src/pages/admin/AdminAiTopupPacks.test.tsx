import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

import AdminAiTopupPacks from "@/pages/admin/AdminAiTopupPacks";
import {
  createAdminTopupPack,
  listAdminTopupPacks,
  updateAdminTopupPack,
  type AdminTopupPack,
} from "@/api/adminAiTopupPacks";

vi.mock("@/api/adminAiTopupPacks", () => ({
  listAdminTopupPacks: vi.fn(),
  createAdminTopupPack: vi.fn(),
  updateAdminTopupPack: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

function pack(overrides: Partial<AdminTopupPack> = {}): AdminTopupPack {
  return {
    id: "p1",
    code: "PACK50",
    label: "Paket 50 ribu",
    amount_idr: 50_000,
    bonus_idr: 0,
    active: true,
    sort_order: 0,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

function listResponse(items: AdminTopupPack[]) {
  return { items, total: items.length };
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AdminAiTopupPacks />
    </QueryClientProvider>,
  );
}

async function openCreateForm() {
  const user = userEvent.setup();
  renderPage();
  await screen.findByTestId("admin-ai-packs-table");
  await user.click(screen.getByTestId("admin-ai-packs-create"));
  await screen.findByTestId("admin-ai-packs-form");
  return user;
}

async function fillCreateForm(
  user: ReturnType<typeof userEvent.setup>,
  values: {
    code: string;
    label: string;
    amount: string;
    bonus?: string;
    sort?: string;
  },
) {
  await user.type(screen.getByTestId("admin-ai-packs-code"), values.code);
  await user.type(screen.getByTestId("admin-ai-packs-label"), values.label);
  await user.type(screen.getByTestId("admin-ai-packs-amount"), values.amount);
  if (values.bonus !== undefined) {
    const bonus = screen.getByTestId("admin-ai-packs-bonus");
    await user.clear(bonus);
    await user.type(bonus, values.bonus);
  }
  if (values.sort !== undefined) {
    const sort = screen.getByTestId("admin-ai-packs-sort");
    await user.clear(sort);
    await user.type(sort, values.sort);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAdminTopupPacks).mockResolvedValue(listResponse([pack()]));
  vi.mocked(createAdminTopupPack).mockResolvedValue(pack({ id: "p2" }));
  vi.mocked(updateAdminTopupPack).mockResolvedValue(pack());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminAiTopupPacks", () => {
  it("lists packs with one action trigger per surface", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByTestId("admin-ai-packs-table")).toHaveTextContent(
      "PACK50",
    );
    expect(screen.getByTestId("admin-ai-packs-table")).toHaveTextContent(
      "Paket 50 ribu",
    );
    expect(listAdminTopupPacks).toHaveBeenCalledTimes(1);

    // Desktop table and mobile cards both render in jsdom; their testids must
    // stay distinct so Playwright strict mode never matches two nodes.
    expect(screen.getAllByTestId("pack-actions-p1")).toHaveLength(1);
    expect(screen.getByTestId("pack-actions-mobile-p1")).toBeInTheDocument();

    await user.click(screen.getByTestId("pack-actions-p1"));
    expect(await screen.findByTestId("pack-toggle-p1")).toBeInTheDocument();
    expect(screen.queryByTestId("pack-toggle-mobile-p1")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByTestId("pack-toggle-p1")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByTestId("pack-actions-mobile-p1"));
    expect(
      await screen.findByTestId("pack-toggle-mobile-p1"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("pack-toggle-p1")).not.toBeInTheDocument();
  });

  it("renders the empty state when the catalog has no packs", async () => {
    vi.mocked(listAdminTopupPacks).mockResolvedValue(listResponse([]));
    renderPage();

    expect(await screen.findByTestId("admin-ai-packs-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-ai-packs-table")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("admin-ai-packs-zero-active"),
    ).not.toBeInTheDocument();
  });

  it("validates the create form and submits whole-IDR values", async () => {
    const user = await openCreateForm();

    await user.click(screen.getByTestId("admin-ai-packs-submit"));
    expect(
      await screen.findByText("Enter a whole amount greater than 0."),
    ).toBeInTheDocument();
    expect(createAdminTopupPack).not.toHaveBeenCalled();

    await user.type(screen.getByTestId("admin-ai-packs-amount"), "abc");
    await user.click(screen.getByTestId("admin-ai-packs-submit"));
    expect(createAdminTopupPack).not.toHaveBeenCalled();

    await user.clear(screen.getByTestId("admin-ai-packs-amount"));
    await fillCreateForm(user, {
      code: "PACK100",
      label: "Paket 100 ribu",
      amount: "100000",
      bonus: "5000",
      sort: "2",
    });
    await user.click(screen.getByTestId("admin-ai-packs-submit"));

    await waitFor(() =>
      expect(createAdminTopupPack).toHaveBeenCalledWith({
        code: "PACK100",
        label: "Paket 100 ribu",
        amount_idr: 100_000,
        bonus_idr: 5_000,
        sort_order: 2,
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Top-up pack added."),
    );
    await waitFor(() => expect(listAdminTopupPacks).toHaveBeenCalledTimes(2));
  });

  it("rejects a non-positive amount before calling the API", async () => {
    const user = await openCreateForm();

    await fillCreateForm(user, {
      code: "PACK0",
      label: "Paket nol",
      amount: "0",
    });
    await user.click(screen.getByTestId("admin-ai-packs-submit"));

    expect(
      await screen.findByText("Enter a whole amount greater than 0."),
    ).toBeInTheDocument();
    expect(createAdminTopupPack).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and shows the error when create fails", async () => {
    vi.mocked(createAdminTopupPack).mockRejectedValue({
      response: {
        status: 409,
        data: { detail: "Top-up pack code already exists" },
      },
    });
    const user = await openCreateForm();

    await fillCreateForm(user, {
      code: "PACK50",
      label: "Duplikat",
      amount: "50000",
    });
    await user.click(screen.getByTestId("admin-ai-packs-submit"));

    expect(
      await screen.findByText("Top-up pack code already exists"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("admin-ai-packs-form")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("submits a PATCH from the edit dialog", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("admin-ai-packs-table");

    await user.click(screen.getByTestId("pack-actions-p1"));
    await user.click(await screen.findByTestId("pack-edit-p1"));
    await screen.findByTestId("admin-ai-packs-form");

    const label = screen.getByTestId("admin-ai-packs-label");
    await user.clear(label);
    await user.type(label, "Paket 75 ribu");
    const amount = screen.getByTestId("admin-ai-packs-amount");
    await user.clear(amount);
    await user.type(amount, "75000");
    await user.click(screen.getByTestId("admin-ai-packs-submit"));

    await waitFor(() =>
      expect(updateAdminTopupPack).toHaveBeenCalledWith("p1", {
        code: "PACK50",
        label: "Paket 75 ribu",
        amount_idr: 75_000,
        bonus_idr: 0,
        sort_order: 0,
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Top-up pack saved."),
    );
    await waitFor(() => expect(listAdminTopupPacks).toHaveBeenCalledTimes(2));
  });

  it("deactivates a pack in one click and refetches", async () => {
    vi.mocked(updateAdminTopupPack).mockResolvedValue(pack({ active: false }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("admin-ai-packs-table");

    await user.click(screen.getByTestId("pack-actions-p1"));
    await user.click(await screen.findByTestId("pack-toggle-p1"));

    await waitFor(() =>
      expect(updateAdminTopupPack).toHaveBeenCalledWith("p1", {
        active: false,
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Top-up pack deactivated.",
      ),
    );
    await waitFor(() => expect(listAdminTopupPacks).toHaveBeenCalledTimes(2));
  });

  it("warns only when every pack is inactive", async () => {
    vi.mocked(listAdminTopupPacks).mockResolvedValue(
      listResponse([
        pack({ id: "p1", active: false }),
        pack({ id: "p2", code: "PACK100", active: false }),
      ]),
    );
    const { unmount } = renderPage();

    expect(
      await screen.findByTestId("admin-ai-packs-zero-active"),
    ).toBeInTheDocument();
    unmount();

    vi.mocked(listAdminTopupPacks).mockResolvedValue(
      listResponse([
        pack({ id: "p1", active: false }),
        pack({ id: "p2", code: "PACK100", active: true }),
      ]),
    );
    renderPage();
    await screen.findByTestId("admin-ai-packs-table");
    expect(
      screen.queryByTestId("admin-ai-packs-zero-active"),
    ).not.toBeInTheDocument();
  });
});
