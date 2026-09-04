import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Assets, { mapAssetError } from "@/pages/Assets";

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFetchColors = vi.fn();
const mockPatchColors = vi.fn();

vi.mock("@/api/assets", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/assets")>("@/api/assets");
  return {
    ...actual,
    listAssets: (...args: unknown[]) => mockList(...args),
    createAsset: (...args: unknown[]) => mockCreate(...args),
    updateAsset: (...args: unknown[]) => mockUpdate(...args),
    fetchTagColors: (...args: unknown[]) => mockFetchColors(...args),
    patchTagColors: (...args: unknown[]) => mockPatchColors(...args),
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
    mockUpdate.mockReset();
    mockFetchColors.mockReset();
    mockPatchColors.mockReset();
    mockList.mockResolvedValue([]);
    mockFetchColors.mockResolvedValue({});
  });

  it("maps sku limit errors", () => {
    expect(mapAssetError("Asset limit for basic tier is 1")).toBe("limit");
  });

  it("shows an empty state with a CTA", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("assets-empty")).toBeInTheDocument());
    expect(screen.getByTestId("assets-empty-cta")).toBeInTheDocument();
    expect(screen.getByTestId("assets-add")).toBeInTheDocument();
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
        tags: [],
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
        tags: ["prod"],
      },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("assets-pack")).toBeInTheDocument());
    expect(screen.getByTestId("assets-pack-html")).toBeInTheDocument();
    expect(screen.getByTestId("asset-tag-prod")).toBeInTheDocument();
    expect(screen.getByTestId("asset-tag-filter")).toBeInTheDocument();
  });

  it("shows Guard chip when asset is linked", async () => {
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
        tags: [],
        guard_agent_id: "g1",
        guard_agent_name: "vps-edge-01",
      },
    ]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("asset-guard-chip-a1")).toHaveTextContent("vps-edge-01"),
    );
  });

  it("filters by multiple tags with type-to-search", async () => {
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
        tags: ["prod"],
      },
      {
        id: "a2",
        name: "Staging",
        scan_type: "domain",
        target: "stg.example.com",
        notes: null,
        schedule_id: null,
        sku: "multi",
        sku_limit: 10,
        tags: ["hotel"],
      },
      {
        id: "a3",
        name: "Lab",
        scan_type: "ip",
        target: "10.0.0.1",
        notes: null,
        schedule_id: null,
        sku: "multi",
        sku_limit: 10,
        tags: ["lab"],
      },
    ]);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("asset-tag-filter")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("asset-tag-filter"));
    await waitFor(() =>
      expect(screen.getByTestId("asset-tag-filter-search")).toBeInTheDocument(),
    );
    await user.type(screen.getByTestId("asset-tag-filter-search"), "ho");
    expect(screen.getByTestId("asset-tag-filter-opt-hotel")).toBeInTheDocument();
    expect(
      screen.queryByTestId("asset-tag-filter-opt-prod"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByTestId("asset-tag-filter-opt-hotel"));
    await user.clear(screen.getByTestId("asset-tag-filter-search"));
    await user.click(screen.getByTestId("asset-tag-filter-opt-prod"));
    expect(screen.getByText("Web")).toBeInTheDocument();
    expect(screen.getByText("Staging")).toBeInTheDocument();
    expect(screen.queryByText("Lab")).not.toBeInTheDocument();
  });

  it("edits name, notes, and tags without changing target", async () => {
    mockList.mockResolvedValue([
      {
        id: "a1",
        name: "Web",
        scan_type: "domain",
        target: "example.com",
        notes: "old",
        schedule_id: null,
        sku: "multi",
        sku_limit: 10,
        tags: ["prod"],
      },
    ]);
    mockUpdate.mockResolvedValue({
      id: "a1",
      name: "Web prod",
      scan_type: "domain",
      target: "example.com",
      notes: "new",
      tags: ["prod", "hotel"],
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("asset-edit-a1")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("asset-edit-a1"));
    const nameInput = screen.getByTestId("asset-name");
    await user.clear(nameInput);
    await user.type(nameInput, "Web prod");
    const notesInput = screen.getByLabelText(/notes/i);
    await user.clear(notesInput);
    await user.type(notesInput, "new");
    const tagsInput = screen.getByTestId("asset-tags");
    await user.clear(tagsInput);
    await user.type(tagsInput, "prod, hotel");
    await user.click(screen.getByTestId("asset-save"));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith("a1", {
        name: "Web prod",
        notes: "new",
        tags: ["prod", "hotel"],
      }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sets a tag color from the palette", async () => {
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
        tags: ["prod"],
      },
    ]);
    mockFetchColors.mockResolvedValue({ prod: "gray" });
    mockPatchColors.mockResolvedValue({ prod: "green" });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("asset-tag-colors-toggle")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("asset-tag-color-prod-green")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("asset-tag-colors-toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("asset-tag-color-prod-green")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("asset-tag-color-prod-green"));
    await waitFor(() =>
      expect(mockPatchColors).toHaveBeenCalledWith({ prod: "green" }),
    );
  });

  it("sets a custom hex color from the picker", async () => {
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
        tags: ["prod"],
      },
    ]);
    mockFetchColors.mockResolvedValue({ prod: "gray" });
    mockPatchColors.mockResolvedValue({ prod: "#ff00aa" });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("asset-tag-colors-toggle")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("asset-tag-colors-toggle"));
    const picker = await screen.findByTestId("asset-tag-color-picker-prod");
    fireEvent.change(picker, { target: { value: "#ff00aa" } });
    await waitFor(() =>
      expect(mockPatchColors).toHaveBeenCalledWith({ prod: "#ff00aa" }),
    );
  });
});
