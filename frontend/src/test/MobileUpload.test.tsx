import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MobileUpload from "@/components/scan/MobileUpload";

vi.mock("@/hooks/useScan", () => ({
  useStartIpScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useStartDomainScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useStartMobileScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock("@/store/scanStore", () => ({
  useScanStore: vi.fn((selector) => {
    const state = {
      activeJobId: null,
      progress: 0,
      status: "pending",
      scanType: null,
      setActiveScan: vi.fn(),
      setProgress: vi.fn(),
      clearActiveScan: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));
vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(() => vi.fn()),
}));

describe("MobileUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders platform selector with Android and iOS buttons", () => {
    render(<MobileUpload />);
    expect(
      screen.getByRole("button", { name: /android \(\.apk\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ios \(\.ipa\)/i }),
    ).toBeInTheDocument();
  });

  it("Android is the default platform", () => {
    render(<MobileUpload />);
    const androidBtn = screen.getByRole("button", {
      name: /android \(\.apk\)/i,
    });
    expect(androidBtn).toBeInTheDocument();
    expect(
      screen.getByText(/drop \.apk file here/i),
    ).toBeInTheDocument();
  });

  it("renders drop zone with file type text", () => {
    render(<MobileUpload />);
    expect(
      screen.getByText(/drop \.apk file here/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/or click to browse \(max 500MB\)/i),
    ).toBeInTheDocument();
  });

  it("submit button is disabled when no file selected", () => {
    render(<MobileUpload />);
    const button = screen.getByRole("button", { name: /start mobile scan/i });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it("file input is hidden", () => {
    render(<MobileUpload />);
    const fileInput = document.querySelector('input[type="file"].hidden');
    expect(fileInput).toBeInTheDocument();
  });

  it("renders submit button with correct text", () => {
    render(<MobileUpload />);
    expect(
      screen.getByRole("button", { name: /start mobile scan/i }),
    ).toBeInTheDocument();
  });
});
