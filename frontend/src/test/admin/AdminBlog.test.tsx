import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminBlog from "@/pages/admin/AdminBlog";
import { adminApi } from "@/api/admin";

vi.mock("@/api/admin", () => ({
  adminApi: {
    listBlogPosts: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    createBlogPost: vi.fn(),
    updateBlogPost: vi.fn(),
    publishBlogPost: vi.fn(),
    unpublishBlogPost: vi.fn(),
  },
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminBlog />
    </QueryClientProvider>,
  );
}

describe("AdminBlog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.listBlogPosts).mockResolvedValue({
      items: [],
      total: 0,
    });
  });

  it("renders blog heading and form", () => {
    renderPage();
    expect(screen.getByText("Blog")).toBeInTheDocument();
    expect(screen.getByTestId("blog-slug")).toBeInTheDocument();
    expect(screen.getByTestId("blog-save")).toBeInTheDocument();
  });

  it("rails the form shell primary and lists an empty island", async () => {
    renderPage();
    expect(
      screen.getByTestId("blog-form-card").querySelector(".bg-primary"),
    ).toBeTruthy();
    const island = await screen.findByTestId("blog-empty");
    expect(island.className).toMatch(/bg-muted\/40/);
    expect(island.className).toMatch(/rounded-xl/);
  });

  it("rails published and draft rows", async () => {
    vi.mocked(adminApi.listBlogPosts).mockResolvedValue({
      items: [
        {
          id: "p1",
          slug: "live",
          title: "Live",
          excerpt: "",
          body_md: "",
          locale: "id",
          status: "published",
          published_at: null,
          created_at: "",
          updated_at: "",
        },
        {
          id: "p2",
          slug: "wip",
          title: "WIP",
          excerpt: "",
          body_md: "",
          locale: "id",
          status: "draft",
          published_at: null,
          created_at: "",
          updated_at: "",
        },
      ],
      total: 2,
    } as never);
    renderPage();
    const desktop = await screen.findByTestId("blog-list-desktop");
    const publishedRow = within(desktop).getByText("live").closest("tr");
    expect(publishedRow?.querySelector(".bg-primary")).toBeTruthy();
    const draftRow = within(desktop).getByText("wip").closest("tr");
    expect(draftRow?.querySelector(".bg-border")).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByTestId("blog-list-shell").querySelector(".bg-primary"),
      ).toBeTruthy(),
    );
  });
});
