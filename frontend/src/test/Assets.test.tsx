import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Assets, { mapAssetError } from "@/pages/Assets";

const mockList = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/api/assets", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/assets")>("@/api/assets");
  return {
    ...actual,
    listAssets: (...args: unknown[]) => mockList(...args),
    createAsset: (...args: unknown[]) => mockCreate(...args),
    deleteAsset: vi.fn(),
    createAssetSchedule: vi.fn(),
    fetchAssetPack: vi.fn(),
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/assets"]}>
        <Routes>
          <Route path="/assets" element={<Assets />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Assets page", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockCreate.mockReset();
    mockList.mockResolvedValue([]);
  });

  it("maps sku limit errors", () => {
    expect(mapAssetError("Asset limit for basic tier is 1")).toBe("limit");
  });

  it("shows an empty state with a CTA", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("assets-empty")).toBeInTheDocument());
    expect(screen.getByTestId("assets-empty-cta")).toBeInTheDocument();
    expect(screen.queryByTestId("assets-pack")).not.toBeInTheDocument();
    expect(screen.queryByTestId("assets-pack-html")).not.toBeInTheDocument();
  });

  it("creates an asset", async () => {
    mockCreate.mockResolvedValue({
      id: "a1",
      name: "Web",
      scan_type: "domain",
      target: "example.com",
      notes: null,
      schedule_id: null,
      sku: "multi",
      sku_limit: 10,
    });
    mockList.mockResolvedValueOnce([]).mockResolvedValue([
      {
        id: "a1",
        name: "Web",
        scan_type: "domain",
        target: "example.com",
        notes: null,
        schedule_id: null,
        sku: "multi",
        sku_limit: 10,
      },
    ]);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("assets-empty-cta")).toBeInTheDocument());
    await user.click(screen.getByTestId("assets-empty-cta"));
    await user.type(screen.getByTestId("asset-name"), "Web");
    await user.type(screen.getByTestId("asset-target"), "example.com");
    await user.click(screen.getByTestId("asset-save"));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  });

  it("shows pack JSON and HTML buttons when assets exist", async () => {
    mockList.mockResolvedValue([
      {
        id: "a1",
        name: "Web",
        scan_type: "domain",
        target: "example.com",
        notes: null,
        schedule_id: null,
        sku: "multi",
        sku_limit: 10,
      },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("assets-pack")).toBeInTheDocument());
    expect(screen.getByTestId("assets-pack-html")).toBeInTheDocument();
  });
});
