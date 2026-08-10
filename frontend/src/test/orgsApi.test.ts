import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/store/authStore", () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ accessToken: "tok" })),
  },
}));

vi.mock("axios", () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    defaults: {},
    interceptors: {
      request: { use: vi.fn() },
    },
  };
  return {
    default: mockAxios,
  };
});

import axios from "axios";
import {
  listOrgs,
  createOrg,
  switchOrg,
  listMembers,
  createInvite,
  revokeInvite,
  acceptInvite,
  canMutateWorkspace,
  canManageMembers,
} from "@/api/orgs";

const mockAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe("orgs API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listOrgs GETs /api/orgs", async () => {
    const orgs = [
      {
        id: "o1",
        name: "Personal",
        slug: "personal-u1",
        role: "owner" as const,
      },
    ];
    mockAxios.get.mockResolvedValueOnce({ data: orgs });
    const result = await listOrgs();
    expect(mockAxios.get).toHaveBeenCalledWith("/api/orgs");
    expect(result).toEqual(orgs);
  });

  it("createOrg POSTs name/slug", async () => {
    const org = { id: "o2", name: "Hotel", slug: "hotel" };
    mockAxios.post.mockResolvedValueOnce({ data: org });
    const result = await createOrg({ name: "Hotel", slug: "hotel" });
    expect(mockAxios.post).toHaveBeenCalledWith("/api/orgs", {
      name: "Hotel",
      slug: "hotel",
    });
    expect(result).toEqual(org);
  });

  it("switchOrg POSTs organization_id", async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: { access_token: "new", refresh_token: "r" },
    });
    const result = await switchOrg("o2");
    expect(mockAxios.post).toHaveBeenCalledWith("/api/orgs/switch", {
      organization_id: "o2",
    });
    expect(result.access_token).toBe("new");
  });

  it("listMembers GETs members path", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    await listMembers("o1");
    expect(mockAxios.get).toHaveBeenCalledWith("/api/orgs/o1/members");
  });

  it("createInvite POSTs email and role", async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: { id: "i1", email: "a@example.com", role: "member" },
    });
    await createInvite("o1", { email: "a@example.com", role: "member" });
    expect(mockAxios.post).toHaveBeenCalledWith("/api/orgs/o1/invites", {
      email: "a@example.com",
      role: "member",
    });
  });

  it("revokeInvite DELETEs invite", async () => {
    mockAxios.delete.mockResolvedValueOnce({});
    await revokeInvite("o1", "i1");
    expect(mockAxios.delete).toHaveBeenCalledWith("/api/orgs/o1/invites/i1");
  });

  it("acceptInvite POSTs token", async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: { organization_id: "o1", role: "member" },
    });
    await acceptInvite("tok-xyz");
    expect(mockAxios.post).toHaveBeenCalledWith("/api/invites/accept", {
      token: "tok-xyz",
    });
  });

  describe("role helpers", () => {
    it("canMutateWorkspace false only for viewer", () => {
      expect(canMutateWorkspace("viewer")).toBe(false);
      expect(canMutateWorkspace("member")).toBe(true);
      expect(canMutateWorkspace("admin")).toBe(true);
      expect(canMutateWorkspace("owner")).toBe(true);
      expect(canMutateWorkspace(null)).toBe(true);
      expect(canMutateWorkspace(undefined)).toBe(true);
    });

    it("canManageMembers only owner/admin", () => {
      expect(canManageMembers("owner")).toBe(true);
      expect(canManageMembers("admin")).toBe(true);
      expect(canManageMembers("member")).toBe(false);
      expect(canManageMembers("viewer")).toBe(false);
      expect(canManageMembers(null)).toBe(false);
    });
  });
});
