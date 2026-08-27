import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkspaceSettings from "@/pages/WorkspaceSettings";
import { useAuthStore } from "@/store/authStore";
import * as orgsApi from "@/api/orgs";

vi.mock("@/api/orgs", async () => {
  const actual = await vi.importActual<typeof import("@/api/orgs")>(
    "@/api/orgs",
  );
  return {
    ...actual,
    listMembers: vi.fn(),
    listInvites: vi.fn(),
    acceptInvite: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
    createOrg: vi.fn(),
  };
});

function renderWorkspace() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WorkspaceSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Workspace accept invite card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useAuthStore.setState({
      user: {
        id: "u1",
        email: "member@example.test",
        is_admin: false,
        is_verified: true,
        credits: 10,
      } as never,
      isAuthenticated: true,
      accessToken: "t",
      isLoading: false,
      error: null,
      organizations: [
        {
          id: "org1",
          name: "Org",
          slug: "org",
          role: "member",
        } as never,
      ],
      activeOrgId: "org1",
    });
    vi.mocked(orgsApi.listMembers).mockResolvedValue([]);
    vi.mocked(orgsApi.listInvites).mockResolvedValue([]);
  });

  it("always shows accept invite form without URL token", async () => {
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByTestId("accept-invite-card")).toBeInTheDocument();
    });
    expect(screen.getByTestId("accept-invite-token")).toBeInTheDocument();
    expect(screen.getByTestId("accept-invite-btn")).toBeInTheDocument();
  });

  it("accepts a pasted token", async () => {
    const user = userEvent.setup();
    vi.mocked(orgsApi.acceptInvite).mockResolvedValue({
      organization_id: "org2",
      role: "member",
      message: "ok",
    });
    renderWorkspace();
    await user.type(screen.getByTestId("accept-invite-token"), "invite-token-abc");
    await user.click(screen.getByTestId("accept-invite-btn"));
    await waitFor(() => {
      expect(orgsApi.acceptInvite).toHaveBeenCalledWith("invite-token-abc");
    });
  });
});
