import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

vi.mock("@/api/auth", () => ({
  getGoogleAuthConfig: vi.fn(),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: (s: { loginWithGoogleToken: () => void }) => unknown) =>
    sel({ loginWithGoogleToken: vi.fn() }),
}));

import { getGoogleAuthConfig } from "@/api/auth";

const mockedConfig = getGoogleAuthConfig as unknown as ReturnType<typeof vi.fn>;

describe("GoogleSignInButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when Google is disabled", async () => {
    mockedConfig.mockResolvedValueOnce({ enabled: false, client_id: "" });
    const { container } = render(<GoogleSignInButton />);
    await waitFor(() => {
      expect(mockedConfig).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders continue button when enabled", async () => {
    mockedConfig.mockResolvedValueOnce({
      enabled: true,
      client_id: "cid.apps.googleusercontent.com",
    });
    render(<GoogleSignInButton />);
    expect(await screen.findByTestId("google-sign-in")).toBeInTheDocument();
  });
});
