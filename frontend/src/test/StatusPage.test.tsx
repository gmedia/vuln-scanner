import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as statusApi from "@/api/statusPage";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StatusPage from "@/pages/StatusPage";
import { useAuthStore } from "@/store/authStore";

const mockGet = vi.fn();

vi.mock("@/api/statusPage", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/statusPage")>(
      "@/api/statusPage",
    );
  return {
    ...actual,
    getStatusPage: (...args: unknown[]) => mockGet(...args),
    upsertStatusPage: vi.fn(),
    patchStatusPage: vi.fn(),
    attachHostname: vi.fn(),
    replaceHostname: vi.fn(),
    detachHostname: vi.fn(),
    checkHostname: vi.fn(),
    addComponent: vi.fn(),
    deleteComponent: vi.fn(),
    createIncident: vi.fn(),
    addIncidentUpdate: vi.fn(),
    patchIncident: vi.fn(),
    deleteIncident: vi.fn(),
  };
});

vi.mock("@/api/uptime", () => ({
  listMonitors: vi.fn().mockResolvedValue([]),
}));

const pageFields = {
  txt_name: null as string | null,
  txt_value: null as string | null,
  ssl_status: null as string | null,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/uptime/status-page"]}>
        <Routes>
          <Route path="/uptime/status-page" element={<StatusPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StatusPage admin", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue(null);
    useAuthStore.setState({
      organizations: [
        { id: "o1", name: "Org", slug: "org", role: "owner" },
      ],
      activeOrgId: "o1",
    });
  });

it("shows empty state with create form", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("status-page-empty")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("status-page-create")).toBeInTheDocument();
  });

  it("lets an existing page change its public slug", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({
      id: "p1",
      organization_id: "o1",
      slug: "erp-stg",
      title: "ERP",
      published: true,
      custom_hostname: null,
      hostname_status: "none",
      cname_target: "status-edge.sinexis.app",
      ...pageFields,
      public_path: "/status/erp-stg",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      components: [],
      incidents: [],
      overall: "operational",
    });
    vi.mocked(statusApi.patchStatusPage).mockResolvedValue({
      id: "p1",
      organization_id: "o1",
      slug: "erp-prod",
      title: "ERP",
      published: true,
      custom_hostname: null,
      hostname_status: "none",
      cname_target: "status-edge.sinexis.app",
      ...pageFields,
      public_path: "/status/erp-prod",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      components: [],
      incidents: [],
      overall: "operational",
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("status-page-slug")).toBeInTheDocument(),
    );
    const input = screen.getByTestId("status-page-slug");
    await user.clear(input);
    await user.type(input, "erp-prod");
    await user.click(screen.getByTestId("status-page-save-slug"));
    expect(statusApi.patchStatusPage).toHaveBeenCalledWith({
      slug: "erp-prod",
      title: "ERP",
    });
  });

  it("saves page title without changing slug", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({
      id: "p1",
      organization_id: "o1",
      slug: "erp-stg",
      title: "ERP",
      published: true,
      custom_hostname: null,
      hostname_status: "none",
      cname_target: "status-edge.sinexis.app",
      ...pageFields,
      public_path: "/status/erp-stg",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      components: [],
      incidents: [],
      overall: "operational",
    });
    vi.mocked(statusApi.patchStatusPage).mockResolvedValue({
      id: "p1",
      organization_id: "o1",
      slug: "erp-stg",
      title: "ERP Status",
      published: true,
      custom_hostname: null,
      hostname_status: "none",
      cname_target: "status-edge.sinexis.app",
      ...pageFields,
      public_path: "/status/erp-stg",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      components: [],
      incidents: [],
      overall: "operational",
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("status-page-title")).toBeInTheDocument(),
    );
    const input = screen.getByTestId("status-page-title");
    await user.clear(input);
    await user.type(input, "ERP Status");
    await user.click(screen.getByTestId("status-page-save-slug"));
    expect(statusApi.patchStatusPage).toHaveBeenCalledWith({
      slug: "erp-stg",
      title: "ERP Status",
    });
  });

  it("edits and deletes an incident for org admin", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({
      id: "p1",
      organization_id: "o1",
      slug: "erp-stg",
      title: "ERP",
      published: true,
      custom_hostname: null,
      hostname_status: "none",
      cname_target: "status-edge.sinexis.app",
      ...pageFields,
      public_path: "/status/erp-stg",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      components: [],
      incidents: [
        {
          id: "i1",
          title: "API blip",
          impact: "minor",
          status: "investigating",
          started_at: "2026-01-01T00:00:00Z",
          resolved_at: null,
          created_at: "2026-01-01T00:00:00Z",
          updates: [],
        },
      ],
      overall: "degraded",
    });
    vi.mocked(statusApi.patchIncident).mockResolvedValue({} as never);
    vi.mocked(statusApi.deleteIncident).mockResolvedValue();
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("status-incident-card-i1")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("status-incident-title-i1")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-incident-post-update-i1")).toBeInTheDocument();
    await user.click(screen.getByTestId("status-incident-menu-i1"));
    await user.click(screen.getByTestId("status-incident-edit-i1"));
    const sheet = await screen.findByTestId("status-incident-sheet");
    expect(sheet.className).toMatch(/right-0/);
    expect(screen.getByTestId("status-incident-card-i1")).toBeInTheDocument();
    const titleInput = screen.getByTestId("status-incident-title-i1");
    await user.clear(titleInput);
    await user.type(titleInput, "API outage");
    await user.click(screen.getByTestId("status-incident-save-i1"));
    expect(statusApi.patchIncident).toHaveBeenCalledWith("i1", {
      title: "API outage",
      impact: "minor",
    });
    await user.click(screen.getByTestId("status-incident-menu-i1"));
    await user.click(screen.getByTestId("status-incident-delete-i1"));
    await user.click(screen.getByTestId("status-incident-delete-confirm-i1"));
    expect(statusApi.deleteIncident).toHaveBeenCalledWith("i1");
  });

  it("posts an incident update from the card CTA", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({
      id: "p1",
      organization_id: "o1",
      slug: "erp-stg",
      title: "ERP",
      published: true,
      custom_hostname: null,
      hostname_status: "none",
      cname_target: "status-edge.sinexis.app",
      ...pageFields,
      public_path: "/status/erp-stg",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      components: [],
      incidents: [
        {
          id: "i1",
          title: "API blip",
          impact: "minor",
          status: "investigating",
          started_at: "2026-01-01T00:00:00Z",
          resolved_at: null,
          created_at: "2026-01-01T00:00:00Z",
          updates: [],
        },
      ],
      overall: "degraded",
    });
    vi.mocked(statusApi.addIncidentUpdate).mockResolvedValue({} as never);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("status-incident-card-i1")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("status-incident-post-update-i1"));
    await user.type(
      screen.getByTestId("status-incident-update-body-i1"),
      "Still looking",
    );
    await user.click(screen.getByTestId("status-incident-update-save-i1"));
    expect(statusApi.addIncidentUpdate).toHaveBeenCalledWith("i1", {
      body: "Still looking",
      status: "monitoring",
    });
  });

  it("hides the new-incident form until New incident is clicked", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({
      id: "p1",
      organization_id: "o1",
      slug: "erp-stg",
      title: "ERP",
      published: true,
      custom_hostname: null,
      hostname_status: "none",
      cname_target: "status-edge.sinexis.app",
      ...pageFields,
      public_path: "/status/erp-stg",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      components: [],
      incidents: [],
      overall: "operational",
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("status-incident-add")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("status-incident-create")).not.toBeInTheDocument();
    expect(screen.queryByTestId("status-incident-sheet")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("status-incident-add"));
    const sheet = await screen.findByTestId("status-incident-sheet");
    expect(sheet).toHaveAttribute("data-slot", "sheet-content");
    expect(sheet.className).toMatch(/right-0/);
    expect(sheet.className).toMatch(/sm:max-w-lg/);
    expect(sheet.className).not.toMatch(/sm:max-w-sm/);
    expect(screen.getByTestId("status-incident-create")).toBeInTheDocument();
    expect(screen.getByTestId("status-incident-title")).toBeInTheDocument();
    expect(screen.getByTestId("status-incident-add")).toBeInTheDocument();
    await user.click(screen.getByTestId("status-incident-create-cancel"));
    await waitFor(() =>
      expect(screen.queryByTestId("status-incident-create")).not.toBeInTheDocument(),
    );
  });

  it("posts a new incident from the create card then closes it", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({
      id: "p1",
      organization_id: "o1",
      slug: "erp-stg",
      title: "ERP",
      published: true,
      custom_hostname: null,
      hostname_status: "none",
      cname_target: "status-edge.sinexis.app",
      ...pageFields,
      public_path: "/status/erp-stg",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      components: [],
      incidents: [],
      overall: "operational",
    });
    vi.mocked(statusApi.createIncident).mockResolvedValue({} as never);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("status-incident-add")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("status-incident-add"));
    await user.type(screen.getByTestId("status-incident-title"), "API blip");
    await user.type(screen.getByTestId("status-incident-body"), "Looking into it");
    await user.click(screen.getByTestId("status-incident-create-save"));
    expect(statusApi.createIncident).toHaveBeenCalledWith({
      title: "API blip",
      impact: "minor",
      status: "investigating",
      body: "Looking into it",
    });
    await waitFor(() =>
      expect(screen.queryByTestId("status-incident-create")).not.toBeInTheDocument(),
    );
  });

  it("attaches a custom hostname on the existing page", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({
      id: "p1",
      organization_id: "o1",
      slug: "erp-stg",
      title: "ERP",
      published: true,
      custom_hostname: null,
      hostname_status: "none",
      cname_target: "status-edge.sinexis.app",
      txt_name: null,
      txt_value: null,
      ssl_status: null,
      public_path: "/status/erp-stg",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      components: [],
      incidents: [],
      overall: "operational",
    });
    vi.mocked(statusApi.attachHostname).mockResolvedValue({
      id: "p1",
      organization_id: "o1",
      slug: "erp-stg",
      title: "ERP",
      published: true,
      custom_hostname: "status-erp.appmedia.id",
      hostname_status: "pending_txt",
      cname_target: "status-edge.sinexis.app",
      txt_name: null,
      txt_value: null,
      ssl_status: "pending_txt",
      public_path: "/status/erp-stg",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      components: [],
      incidents: [],
      overall: "operational",
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("status-page-host")).toBeInTheDocument(),
    );
    const input = screen.getByTestId("status-page-host");
    await user.clear(input);
    await user.type(input, "status-erp.appmedia.id");
    await user.click(screen.getByRole("button", { name: "Attach" }));
    expect(statusApi.attachHostname).toHaveBeenCalledWith(
      "status-erp.appmedia.id",
    );
  });

  it("removes a component with an icon button", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({
      id: "p1",
      organization_id: "o1",
      slug: "erp-stg",
      title: "ERP",
      published: true,
      custom_hostname: null,
      hostname_status: "none",
      cname_target: "status-edge.sinexis.app",
      ...pageFields,
      public_path: "/status/erp-stg",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      components: [
        {
          id: "c1",
          monitor_id: "m1",
          display_name: "API",
          sort_order: 0,
          state: "up",
        },
      ],
      incidents: [],
      overall: "operational",
    });
    vi.mocked(statusApi.deleteComponent).mockResolvedValue();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("API")).toBeInTheDocument(),
    );
    const remove = screen.getByTestId("status-component-remove-c1");
    expect(remove).toHaveAttribute("aria-label", "Remove");
    expect(remove.textContent).not.toMatch(/Remove/);
    await user.click(remove);
    expect(statusApi.deleteComponent).toHaveBeenCalledWith(
      "c1",
      expect.anything(),
    );
  });

  it("shows TXT card while hostname_status is pending_txt", async () => {
    mockGet.mockResolvedValue({
      id: "p1",
      organization_id: "o1",
      slug: "erp-stg",
      title: "ERP",
      published: true,
      custom_hostname: "status.example.com",
      hostname_status: "pending_txt",
      cname_target: "customers.sinexis.app",
      txt_name: "_cf-custom-hostname.status.example.com",
      txt_value: "uuid-token",
      ssl_status: "pending_validation",
      public_path: "/status/erp-stg",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      components: [],
      incidents: [],
      overall: "operational",
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("TXT validation")).toBeInTheDocument(),
    );
    expect(screen.getByText("Waiting for TXT")).toBeInTheDocument();
    expect(screen.queryByText("pending_txt")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-page-host")).toBeInTheDocument();
    expect(screen.getByTestId("status-copy-cname")).toBeInTheDocument();
    expect(screen.getByTestId("status-copy-txt-name")).toBeInTheDocument();
    expect(screen.getByTestId("status-copy-txt-value")).toBeInTheDocument();
    expect(
      screen.getByText("status.example.com → customers.sinexis.app"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/_cf-custom-hostname.status.example.com/),
    ).toBeInTheDocument();
    expect(screen.getByText("uuid-token")).toBeInTheDocument();
    expect(
      screen.getByText("Do not point A/AAAA at the origin."),
    ).toBeInTheDocument();
  });
});
