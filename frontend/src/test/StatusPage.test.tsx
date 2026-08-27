import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StatusPage from "@/pages/StatusPage";

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
    verifyHostname: vi.fn(),
    addComponent: vi.fn(),
    deleteComponent: vi.fn(),
    createIncident: vi.fn(),
    addIncidentUpdate: vi.fn(),
  };
});

vi.mock("@/api/uptime", () => ({
  listMonitors: vi.fn().mockResolvedValue([]),
}));

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
  });

  it("shows empty create form", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("status-page-empty")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("status-page-create")).toBeInTheDocument();
  });
});
