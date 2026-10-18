import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/api/scans", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import {
  addComponent,
  addIncidentUpdate,
  attachHostname,
  checkHostname,
  createIncident,
  deleteComponent,
  deleteIncident,
  detachHostname,
  getStatusPage,
  patchIncident,
  patchStatusPage,
  replaceHostname,
  upsertStatusPage,
} from "@/api/statusPage";

const statusPage = {
  id: "sp1",
  organization_id: "org1",
  slug: "acme",
  title: "Acme status",
  published: true,
  custom_hostname: "status.acme.test",
  hostname_status: "active",
  cname_target: "status.sinexis.app",
  txt_name: "_sinexis-status.acme.test",
  txt_value: "verify-token",
  ssl_status: "active",
  public_path: "/status/acme",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-02T00:00:00Z",
  components: [],
  incidents: [],
  overall: "operational",
};

describe("status page API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getStatusPage GETs /api/status-page and returns the payload", async () => {
    mockGet.mockResolvedValue({ data: statusPage });
    await expect(getStatusPage()).resolves.toEqual(statusPage);
    expect(mockGet).toHaveBeenCalledWith("/api/status-page");
  });

  it("getStatusPage returns null when the org has no status page", async () => {
    mockGet.mockResolvedValue({ data: null });
    await expect(getStatusPage()).resolves.toBeNull();
  });

  it("upsertStatusPage PUTs slug and title", async () => {
    mockPut.mockResolvedValue({ data: statusPage });
    await expect(
      upsertStatusPage({ slug: "acme", title: "Acme status" }),
    ).resolves.toEqual(statusPage);
    expect(mockPut).toHaveBeenCalledWith("/api/status-page", {
      slug: "acme",
      title: "Acme status",
    });
  });

  it("patchStatusPage PATCHes partial settings", async () => {
    mockPatch.mockResolvedValue({ data: statusPage });
    const payload = { title: "Acme", published: false, custom_hostname: null };
    await expect(patchStatusPage(payload)).resolves.toEqual(statusPage);
    expect(mockPatch).toHaveBeenCalledWith("/api/status-page", payload);
  });

  it("attachHostname POSTs the hostname", async () => {
    mockPost.mockResolvedValue({ data: statusPage });
    await expect(attachHostname("status.acme.test")).resolves.toEqual(
      statusPage,
    );
    expect(mockPost).toHaveBeenCalledWith("/api/status-page/hostname", {
      hostname: "status.acme.test",
    });
  });

  it("replaceHostname PUTs the hostname", async () => {
    mockPut.mockResolvedValue({ data: statusPage });
    await expect(replaceHostname("status2.acme.test")).resolves.toEqual(
      statusPage,
    );
    expect(mockPut).toHaveBeenCalledWith("/api/status-page/hostname", {
      hostname: "status2.acme.test",
    });
  });

  it("detachHostname DELETEs the hostname binding", async () => {
    mockDelete.mockResolvedValue({ data: statusPage });
    await expect(detachHostname()).resolves.toEqual(statusPage);
    expect(mockDelete).toHaveBeenCalledWith("/api/status-page/hostname");
  });

  it("checkHostname POSTs to the check endpoint without a body", async () => {
    mockPost.mockResolvedValue({ data: statusPage });
    await expect(checkHostname()).resolves.toEqual(statusPage);
    expect(mockPost).toHaveBeenCalledWith("/api/status-page/hostname/check");
  });

  it("addComponent POSTs the component payload", async () => {
    mockPost.mockResolvedValue({ data: statusPage });
    const payload = {
      monitor_id: "mon1",
      display_name: "API",
      sort_order: 2,
    };
    await expect(addComponent(payload)).resolves.toEqual(statusPage);
    expect(mockPost).toHaveBeenCalledWith(
      "/api/status-page/components",
      payload,
    );
  });

  it("deleteComponent DELETEs by component id", async () => {
    mockDelete.mockResolvedValue({});
    await expect(deleteComponent("comp1")).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledWith(
      "/api/status-page/components/comp1",
    );
  });

  it("createIncident POSTs the incident payload", async () => {
    mockPost.mockResolvedValue({ data: statusPage });
    const payload = {
      title: "Elevated errors",
      impact: "minor",
      status: "investigating",
      body: "We are investigating.",
    };
    await expect(createIncident(payload)).resolves.toEqual(statusPage);
    expect(mockPost).toHaveBeenCalledWith(
      "/api/status-page/incidents",
      payload,
    );
  });

  it("addIncidentUpdate POSTs to the incident updates endpoint", async () => {
    mockPost.mockResolvedValue({ data: statusPage });
    const payload = { body: "Fix deployed.", status: "resolved" };
    await expect(addIncidentUpdate("inc1", payload)).resolves.toEqual(
      statusPage,
    );
    expect(mockPost).toHaveBeenCalledWith(
      "/api/status-page/incidents/inc1/updates",
      payload,
    );
  });

  it("patchIncident PATCHes the incident", async () => {
    mockPatch.mockResolvedValue({ data: statusPage });
    const payload = { title: "Renamed", impact: "major" };
    await expect(patchIncident("inc1", payload)).resolves.toEqual(statusPage);
    expect(mockPatch).toHaveBeenCalledWith(
      "/api/status-page/incidents/inc1",
      payload,
    );
  });

  it("deleteIncident DELETEs by incident id", async () => {
    mockDelete.mockResolvedValue({});
    await expect(deleteIncident("inc1")).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledWith("/api/status-page/incidents/inc1");
  });

  it("propagates request failures", async () => {
    const error = new Error("status page unavailable");
    mockGet.mockRejectedValue(error);
    await expect(getStatusPage()).rejects.toBe(error);
  });
});
