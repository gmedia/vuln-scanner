import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminUserDetail from "@/pages/admin/AdminUserDetail";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock("@/api/admin", () => ({
  adminApi: {
    getUserDetail: vi.fn(),
    updateUserCredits: vi.fn(),
  },
}));

import { useQuery, useMutation } from "@tanstack/react-query";

const mockUser = {
  id: "user-1",
  email: "detail@example.com",
  is_admin: false,
  is_verified: false,
  credits: 25,
  scan_count: 7,
  created_at: "2024-01-15T12:00:00Z",
};

function renderPage(userId = "user-1") {
  return render(
    <MemoryRouter initialEntries={[`/admin/users/${userId}`]}>
      <Routes>
        <Route path="/admin/users/:id" element={<AdminUserDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminUserDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as ReturnType<typeof useMutation>);
  });

  it("renders User details heading", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText("User details")).toBeInTheDocument();
  });

  it("shows loading skeletons while fetching", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);

    renderPage();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Profile card when user data is present", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockUser,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("detail@example.com")).toBeInTheDocument();
    expect(screen.getByText("25 credits")).toBeInTheDocument();
    expect(screen.getByText("7 scans performed")).toBeInTheDocument();
  });

  it("renders Credit adjustment section with sentence-case CTA", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockUser,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText("Credit adjustment")).toBeInTheDocument();
    expect(screen.getByText("Amount (+ or −)")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adjust credits" }),
    ).toBeInTheDocument();
  });

  it("shows Unverified badge with pending variant", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockUser,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    const badge = screen.getByText("Unverified");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/yellow/);
  });

  it("formats joined date unambiguously", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockUser,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText(/Joined Jan 15, 2024/)).toBeInTheDocument();
  });

  it("shows user not found when data is missing", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText("User not found")).toBeInTheDocument();
  });

  it("navigates back to users list", async () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockUser,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /Back/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/users");
  });

  it("copies email to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    vi.mocked(useQuery).mockReturnValue({
      data: mockUser,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Copy email" }));
    expect(writeText).toHaveBeenCalledWith("detail@example.com");
  });
});
