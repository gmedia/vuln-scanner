import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "@/hooks/useWebSocket";

vi.mock("@/api/scans", () => ({
  getWsUrl: vi.fn((jobId: string) => `ws://mock/ws/scan/${jobId}`),
}));

interface WsLike {
  onopen: (() => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  readyState: number;
}

describe("useWebSocket", () => {
  let lastWs: WsLike;
  let allWs: WsLike[];

  beforeEach(() => {
    allWs = [];
    const MockWebSocket = vi.fn().mockImplementation(function (this: WsLike, _url: string) {
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this.onclose = null;
      this.close = vi.fn();
      this.send = vi.fn();
      this.readyState = 1;
      allWs.push(this);
      lastWs = allWs[allWs.length - 1];
    }) as unknown as typeof globalThis.WebSocket;

    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not open WebSocket when jobId is null", () => {
    const onProgress = vi.fn();
    renderHook(() => useWebSocket(null, onProgress));

    expect(WebSocket).not.toHaveBeenCalled();
  });

  it("opens WebSocket with correct URL when jobId is provided", () => {
    const onProgress = vi.fn();
    renderHook(() => useWebSocket("job-42", onProgress));

    expect(WebSocket).toHaveBeenCalledWith("ws://mock/ws/scan/job-42");
  });

  it("calls onProgress when progress message is received", () => {
    const onProgress = vi.fn();
    renderHook(() => useWebSocket("job-42", onProgress));

    const message = {
      type: "progress",
      step: "port-scanning",
      progress: 45,
      message: "Scanning ports 1-1000...",
    };

    act(() => {
      lastWs.onmessage?.(new MessageEvent("message", {
        data: JSON.stringify(message),
      }));
    });

    expect(onProgress).toHaveBeenCalledWith(message);
  });

  it("ignores non-progress messages", () => {
    const onProgress = vi.fn();
    renderHook(() => useWebSocket("job-42", onProgress));

    act(() => {
      lastWs.onmessage?.(new MessageEvent("message", {
        data: JSON.stringify({ type: "other", data: "something" }),
      }));
    });

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("ignores invalid JSON messages", () => {
    const onProgress = vi.fn();
    renderHook(() => useWebSocket("job-42", onProgress));

    act(() => {
      lastWs.onmessage?.(new MessageEvent("message", {
        data: "not json",
      }));
    });

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("closes WebSocket on error", () => {
    const onProgress = vi.fn();
    renderHook(() => useWebSocket("job-42", onProgress));

    act(() => {
      lastWs.onerror?.(new Event("error"));
    });

    expect(lastWs.close).toHaveBeenCalled();
  });

  it("closes WebSocket on unmount", () => {
    const onProgress = vi.fn();
    const { unmount } = renderHook(() => useWebSocket("job-42", onProgress));

    unmount();

    expect(lastWs.close).toHaveBeenCalled();
  });

  it("reconnects when jobId changes", () => {
    const onProgress = vi.fn();
    const { rerender } = renderHook(
      ({ jobId }) => useWebSocket(jobId, onProgress),
      { initialProps: { jobId: "job-1" } },
    );

    expect(WebSocket).toHaveBeenCalledTimes(1);

    const firstWs = allWs[0];
    rerender({ jobId: "job-2" });

    expect(WebSocket).toHaveBeenCalledTimes(2);
    expect(firstWs.close).toHaveBeenCalled();
  });
});
