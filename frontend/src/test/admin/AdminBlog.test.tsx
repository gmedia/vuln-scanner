import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function post(overrides: Partial<Record<string, string>> = {}) {
  return {
    id: "p1",
    slug: "live",
    title: "Live",
    excerpt: "",
    body_md: "",
    locale: "id",
    status: "draft",
    published_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
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

  it("creates a post from the form and clears it", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.createBlogPost).mockResolvedValue({} as never);
    renderPage();

    await user.type(screen.getByTestId("blog-slug"), "hello");
    await user.type(screen.getByTestId("blog-title"), "Hello");
    await user.type(screen.getByTestId("blog-excerpt"), "Short");
    await user.type(screen.getByTestId("blog-body"), "# Body");
    await user.click(screen.getByTestId("blog-save"));

    await waitFor(() =>
      expect(adminApi.createBlogPost).toHaveBeenCalledWith({
        slug: "hello",
        title: "Hello",
        excerpt: "Short",
        body_md: "# Body",
        locale: "id",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("blog-slug")).toHaveValue(""),
    );
  });

  it("loads a row into the form and updates it", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listBlogPosts).mockResolvedValue({
      items: [
        post({
          id: "p1",
          slug: "live",
          title: "Live",
          excerpt: "Short",
          body_md: "# Body",
          status: "published",
        }),
      ],
      total: 1,
    } as never);
    vi.mocked(adminApi.updateBlogPost).mockResolvedValue({} as never);
    renderPage();

    const desktop = await screen.findByTestId("blog-list-desktop");
    await user.click(within(desktop).getByTestId("blog-actions-p1"));
    await user.click(await screen.findByTestId("blog-edit-p1"));

    expect(screen.getByTestId("blog-slug")).toHaveValue("live");
    expect(screen.getByText("Edit")).toBeInTheDocument();

    await user.clear(screen.getByTestId("blog-title"));
    await user.type(screen.getByTestId("blog-title"), "Live v2");
    await user.click(screen.getByTestId("blog-save"));

    await waitFor(() =>
      expect(adminApi.updateBlogPost).toHaveBeenCalledWith("p1", {
        slug: "live",
        title: "Live v2",
        excerpt: "Short",
        body_md: "# Body",
        locale: "id",
      }),
    );
    await waitFor(() => expect(screen.getByText("New article")).toBeInTheDocument());
  });

  it("cancels an edit without writing", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listBlogPosts).mockResolvedValue({
      items: [
        post({
          id: "p1",
          slug: "live",
          title: "Live",
          excerpt: "Short",
          body_md: "# Body",
          status: "draft",
        }),
      ],
      total: 1,
    } as never);
    renderPage();

    const desktop = await screen.findByTestId("blog-list-desktop");
    await user.click(within(desktop).getByTestId("blog-actions-p1"));
    await user.click(await screen.findByTestId("blog-edit-p1"));
    expect(screen.getByTestId("blog-slug")).toHaveValue("live");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByTestId("blog-slug")).toHaveValue("");
    expect(screen.getByText("New article")).toBeInTheDocument();
    expect(adminApi.updateBlogPost).not.toHaveBeenCalled();
  });

  it("publishes a draft and unpublishes a live post", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listBlogPosts).mockResolvedValue({
      items: [
        post({ id: "p1", slug: "live", title: "Live", status: "published" }),
        post({ id: "p2", slug: "wip", title: "WIP", status: "draft" }),
      ],
      total: 2,
    } as never);
    vi.mocked(adminApi.publishBlogPost).mockResolvedValue({} as never);
    vi.mocked(adminApi.unpublishBlogPost).mockResolvedValue({} as never);
    renderPage();

    const desktop = await screen.findByTestId("blog-list-desktop");

    await user.click(within(desktop).getByTestId("blog-actions-p2"));
    await user.click(await screen.findByTestId("blog-publish-p2"));
    await waitFor(() =>
      expect(adminApi.publishBlogPost).toHaveBeenCalledWith("p2"),
    );

    await user.click(within(desktop).getByTestId("blog-actions-p1"));
    await user.click(await screen.findByTestId("blog-unpublish-p1"));
    await waitFor(() =>
      expect(adminApi.unpublishBlogPost).toHaveBeenCalledWith("p1", "draft"),
    );
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
