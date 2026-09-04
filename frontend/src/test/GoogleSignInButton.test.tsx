import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    delete window.google;
  });

  it("renders nothing when Google is disabled", async () => {
    mockedConfig.mockResolvedValueOnce({ enabled: false, client_id: "" });
    const { container } = render(<GoogleSignInButton />);
    await waitFor(() => {
      expect(mockedConfig).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders outline continue button when enabled", async () => {
    mockedConfig.mockResolvedValueOnce({
      enabled: true,
      client_id: "cid.apps.googleusercontent.com",
    });
    render(<GoogleSignInButton />);
    expect(await screen.findByTestId("google-sign-in")).toBeInTheDocument();
    expect(screen.getByTestId("google-sign-in-btn")).toHaveTextContent(
      /sign in with google/i,
    );
  });

  it("calls GIS prompt on click after initialize", async () => {
    const prompt = vi.fn();
    const initialize = vi.fn();
    window.google = {
      accounts: {
        id: { initialize, prompt },
      },
    };
    mockedConfig.mockResolvedValueOnce({
      enabled: true,
      client_id: "cid.apps.googleusercontent.com",
    });
    render(<GoogleSignInButton />);
    const btn = await screen.findByTestId("google-sign-in-btn");
    await waitFor(() => {
      expect(initialize).toHaveBeenCalled();
    });
    await userEvent.click(btn);
    expect(prompt).toHaveBeenCalled();
  });
});
