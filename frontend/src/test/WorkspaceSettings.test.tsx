import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import WorkspaceSettings from "@/pages/WorkspaceSettings";

vi.mock("@/api/orgs", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/orgs")>("@/api/orgs");
  return {
    ...actual,
    listMembers: vi.fn(async () => []),
    listInvites: vi.fn(async () => []),
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/settings/workspace"]}>
        <WorkspaceSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WorkspaceSettings pilot checklist", () => {
  beforeEach(() => {
    useAuthStore.setState({
      activeOrgId: "org-a",
      organizations: [
        {
          id: "org-a",
          name: "Org A",
          slug: "org-a",
          role: "owner",
          kind: "team",
        },
      ],
    });
  });

  it("renders checklist copy and product links", () => {
    renderPage();
    expect(screen.getByTestId("pilot-checklist")).toBeInTheDocument();
    expect(screen.getByText("Pilot checklist")).toBeInTheDocument();
    expect(screen.getByTestId("pilot-link-assets")).toHaveAttribute(
      "href",
      "/assets",
    );
    expect(screen.getByTestId("pilot-link-schedules")).toHaveAttribute(
      "href",
      "/schedules",
    );
    expect(screen.getByTestId("pilot-link-credits")).toHaveAttribute(
      "href",
      "/credit-history",
    );
  });

  it("hides checklist when there is no org", () => {
    useAuthStore.setState({ activeOrgId: null, organizations: [] });
    renderPage();
    expect(screen.queryByTestId("pilot-checklist")).not.toBeInTheDocument();
  });
});
