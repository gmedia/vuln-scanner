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

  it("shows empty create form", async () => {
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
      expect(screen.getByTestId("status-incident-title-i1")).toBeInTheDocument(),
    );
    const titleInput = screen.getByTestId("status-incident-title-i1");
    await user.clear(titleInput);
    await user.type(titleInput, "API outage");
    await user.click(screen.getByTestId("status-incident-save-i1"));
    expect(statusApi.patchIncident).toHaveBeenCalledWith("i1", {
      title: "API outage",
      impact: "minor",
    });
    await user.click(screen.getByTestId("status-incident-delete-i1"));
    await user.click(screen.getByTestId("status-incident-delete-confirm-i1"));
    expect(statusApi.deleteIncident).toHaveBeenCalledWith("i1");
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
    expect(
      screen.getByText(/_cf-custom-hostname.status.example.com/),
    ).toBeInTheDocument();
  });
});
