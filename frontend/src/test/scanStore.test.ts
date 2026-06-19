import { describe, it, expect, beforeEach } from "vitest";
import { useScanStore } from "@/store/scanStore";

describe("scanStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useScanStore.setState({
      activeJobId: null,
      progress: 0,
      status: "pending",
      scanType: null,
    });
  });

  it("starts with default state", () => {
    const state = useScanStore.getState();
    expect(state.activeJobId).toBeNull();
    expect(state.progress).toBe(0);
    expect(state.status).toBe("pending");
    expect(state.scanType).toBeNull();
  });

  it("setActiveScan sets job ID and scan type, resets progress", () => {
    useScanStore.getState().setActiveScan("job-123", "ip");
    const state = useScanStore.getState();
    expect(state.activeJobId).toBe("job-123");
    expect(state.scanType).toBe("ip");
    expect(state.progress).toBe(0);
    expect(state.status).toBe("pending");
  });

  it("setProgress updates progress and status", () => {
    useScanStore.getState().setActiveScan("job-123", "ip");
    useScanStore.getState().setProgress(50, "running");
    const state = useScanStore.getState();
    expect(state.progress).toBe(50);
    expect(state.status).toBe("running");
  });

  it("clearActiveScan resets everything to initial state", () => {
    useScanStore.getState().setActiveScan("job-123", "domain");
    useScanStore.getState().setProgress(100, "completed");
    useScanStore.getState().clearActiveScan();
    const state = useScanStore.getState();
    expect(state.activeJobId).toBeNull();
    expect(state.scanType).toBeNull();
    expect(state.progress).toBe(0);
    expect(state.status).toBe("pending");
  });

  it("supports full scan lifecycle: start → progress → complete", () => {
    const store = useScanStore.getState();

    store.setActiveScan("scan-42", "ip");
    expect(useScanStore.getState().activeJobId).toBe("scan-42");

    store.setProgress(25, "port-scanning");
    expect(useScanStore.getState().progress).toBe(25);

    store.setProgress(60, "cve-lookup");
    expect(useScanStore.getState().progress).toBe(60);
    expect(useScanStore.getState().status).toBe("cve-lookup");

    store.setProgress(100, "completed");
    expect(useScanStore.getState().progress).toBe(100);

    store.clearActiveScan();
    expect(useScanStore.getState().activeJobId).toBeNull();
  });
});
