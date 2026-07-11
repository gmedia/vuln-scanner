import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import userEvent from "@testing-library/user-event";
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
vi.mock("@/hooks/useScanCredit", () => ({
  useScanCredit: vi.fn(() => ({
    credits: 100,
    creditDisplay: React.createElement("div", { "data-testid": "credit-display" }, "Available Credits: 100"),
    checkAndDeduct: vi.fn().mockResolvedValue({ eligible: true, error: null }),
    refreshAfterScan: vi.fn(),
  })),
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

  it("displays available credits", () => {
    render(<MobileUpload />);
    expect(screen.getByTestId("credit-display")).toBeInTheDocument();
  });

  it("switches to iOS platform when iOS button is clicked", async () => {
    const user = userEvent.setup();
    render(<MobileUpload />);
    const iosBtn = screen.getByRole("button", { name: /ios \(\.ipa\)/i });
    await user.click(iosBtn);
    expect(screen.getByText(/drop \.ipa file here/i)).toBeInTheDocument();
  });

  it("shows error for wrong file type on Android platform", async () => {
    render(<MobileUpload />);
    const file = new File(["test"], "test.ipa", { type: "application/octet-stream" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(screen.getByText("Invalid file type. Expected .apk for Android.")).toBeInTheDocument();
  });

  it("shows error for wrong file type on iOS platform", async () => {
    const user = userEvent.setup();
    render(<MobileUpload />);
    const iosBtn = screen.getByRole("button", { name: /ios \(\.ipa\)/i });
    await user.click(iosBtn);
    const file = new File(["test"], "test.apk", { type: "application/vnd.android.package-archive" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(screen.getByText("Invalid file type. Expected .ipa for iOS.")).toBeInTheDocument();
  });

  it("shows error for file exceeding max size", async () => {
    render(<MobileUpload />);
    const largeFile = new File([""], "test.apk", { type: "application/vnd.android.package-archive" });
    Object.defineProperty(largeFile, "size", { value: 501 * 1024 * 1024 });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [largeFile] } });
    expect(screen.getByText("File too large. Maximum size is 500MB.")).toBeInTheDocument();
  });

  it("displays selected file info", async () => {
    render(<MobileUpload />);
    const file = new File(["test content"], "my-app.apk", { type: "application/vnd.android.package-archive" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("my-app.apk")).toBeInTheDocument();
    });
  });

  it("clears file when clear button is clicked", async () => {
    const user = userEvent.setup();
    render(<MobileUpload />);
    const file = new File(["test"], "test.apk", { type: "application/vnd.android.package-archive" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("test.apk")).toBeInTheDocument();
    });
    const clearBtn = screen.getByRole("button", { name: "" });
    await user.click(clearBtn);
    await waitFor(() => {
      expect(screen.queryByText("test.apk")).not.toBeInTheDocument();
      expect(screen.getByText(/drop \.apk file here/i)).toBeInTheDocument();
    });
  });

  it("clears file when switching platform", async () => {
    const user = userEvent.setup();
    render(<MobileUpload />);
    const file = new File(["test"], "test.apk", { type: "application/vnd.android.package-archive" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("test.apk")).toBeInTheDocument();
    });
    const iosBtn = screen.getByRole("button", { name: /ios \(\.ipa\)/i });
    await user.click(iosBtn);
    await waitFor(() => {
      expect(screen.queryByText("test.apk")).not.toBeInTheDocument();
      expect(screen.getByText(/drop \.ipa file here/i)).toBeInTheDocument();
    });
  });

  it("enables submit button when valid file is selected", async () => {
    render(<MobileUpload />);
    const file = new File(["test"], "app.apk", { type: "application/vnd.android.package-archive" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /start mobile scan/i })).not.toBeDisabled();
    });
  });



  it("handles drag and drop", async () => {
    render(<MobileUpload />);
    const dropZone = screen.getByText(/drop \.apk file here/i).parentElement as HTMLElement;
    const file = new File(["test"], "app.apk", { type: "application/vnd.android.package-archive" });
    const dataTransfer = { files: [file] };
    fireEvent.dragOver(dropZone);
    expect(dropZone).toHaveClass("border-primary");
    fireEvent.drop(dropZone, { dataTransfer });
    await waitFor(() => {
      expect(screen.getByText("app.apk")).toBeInTheDocument();
    });
  });

  it("shows error when dropping invalid file", async () => {
    render(<MobileUpload />);
    const dropZone = screen.getByText(/drop \.apk file here/i).parentElement as HTMLElement;
    const file = new File(["test"], "test.txt", { type: "text/plain" });
    const dataTransfer = { files: [file] };
    fireEvent.drop(dropZone, { dataTransfer });
    expect(screen.getByText("Invalid file type. Expected .apk for Android.")).toBeInTheDocument();
  });

  it("handles drag leave", async () => {
    render(<MobileUpload />);
    const dropZone = screen.getByText(/drop \.apk file here/i).parentElement as HTMLElement;
    fireEvent.dragOver(dropZone);
    expect(dropZone).toHaveClass("border-primary");
    fireEvent.dragLeave(dropZone);
    expect(dropZone).not.toHaveClass("border-primary");
  });

  it("clicking drop zone triggers file input", async () => {
    const user = userEvent.setup();
    render(<MobileUpload />);
    const dropZone = screen.getByText(/drop \.apk file here/i).parentElement as HTMLElement;
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");
    await user.click(dropZone);
    expect(clickSpy).toHaveBeenCalled();
  });

  it("formats file size correctly for bytes", async () => {
    render(<MobileUpload />);
    const file = new File(["x"], "test.apk", { type: "application/vnd.android.package-archive" });
    Object.defineProperty(file, "size", { value: 500 });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/500 B/)).toBeInTheDocument();
    });
  });

  it("formats file size correctly for kilobytes", async () => {
    render(<MobileUpload />);
    const file = new File(["x"], "test.apk", { type: "application/vnd.android.package-archive" });
    Object.defineProperty(file, "size", { value: 2048 });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
    });
  });

  it("formats file size correctly for megabytes", async () => {
    render(<MobileUpload />);
    const file = new File(["x"], "test.apk", { type: "application/vnd.android.package-archive" });
    Object.defineProperty(file, "size", { value: 2 * 1024 * 1024 });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument();
    });
  });

  it("handles file selection cancel gracefully", async () => {
    render(<MobileUpload />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(screen.getByText(/drop \.apk file here/i)).toBeInTheDocument();
  });

  it("shows correct accept attribute for Android", () => {
    render(<MobileUpload />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toHaveAttribute("accept", ".apk");
  });

  it("shows correct accept attribute for iOS", async () => {
    const user = userEvent.setup();
    render(<MobileUpload />);
    const iosBtn = screen.getByRole("button", { name: /ios \(\.ipa\)/i });
    await user.click(iosBtn);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toHaveAttribute("accept", ".ipa");
  });

  it("drop zone has correct styling when dragging", () => {
    render(<MobileUpload />);
    const dropZone = screen.getByText(/drop \.apk file here/i).parentElement as HTMLElement;
    fireEvent.dragOver(dropZone);
    expect(dropZone.className).toContain("border-primary");
    expect(dropZone.className).toContain("bg-primary/5");
  });

  it("drop zone has correct styling when not dragging", () => {
    render(<MobileUpload />);
    const dropZone = screen.getByText(/drop \.apk file here/i).parentElement as HTMLElement;
    expect(dropZone.className).toContain("border-border");
  });

  it("shows upload icon in drop zone", () => {
    render(<MobileUpload />);
    const uploadIcon = document.querySelector("svg.lucide");
    expect(uploadIcon).toBeInTheDocument();
  });

  it("shows smartphone icon in platform buttons", () => {
    render(<MobileUpload />);
    const smartphoneIcons = document.querySelectorAll("svg.lucide");
    expect(smartphoneIcons.length).toBeGreaterThanOrEqual(2);
  });

  it("shows file icon when file is selected", async () => {
    render(<MobileUpload />);
    const file = new File(["test"], "test.apk", { type: "application/vnd.android.package-archive" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      const fileIcon = document.querySelector("svg.lucide");
      expect(fileIcon).toBeInTheDocument();
    });
  });

  it("shows x icon for clear button when file is selected", async () => {
    render(<MobileUpload />);
    const file = new File(["test"], "test.apk", { type: "application/vnd.android.package-archive" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      const xIcon = document.querySelector("button svg.lucide");
      expect(xIcon).toBeInTheDocument();
    });
  });

  it("shows file warning icon when error is displayed", async () => {
    render(<MobileUpload />);
    const file = new File(["test"], "test.ipa", { type: "application/octet-stream" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      const errorContainer = document.querySelector(".bg-red-600\\/10");
      expect(errorContainer).toBeInTheDocument();
      const svg = errorContainer?.querySelector("svg.lucide");
      expect(svg).toBeInTheDocument();
    });
  });
});
