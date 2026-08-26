import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminBlog from "@/pages/admin/AdminBlog";

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
  });

  it("renders blog heading and form", () => {
    renderPage();
    expect(screen.getByText("Blog")).toBeInTheDocument();
    expect(screen.getByTestId("blog-slug")).toBeInTheDocument();
    expect(screen.getByTestId("blog-save")).toBeInTheDocument();
  });
});
