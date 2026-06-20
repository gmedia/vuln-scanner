import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  getScanHistory,
  getScan,
  getScanFindings,
  startIpScan,
  startDomainScan,
  startMobileScan,
} from "@/api/scans";
import {
  useScanHistory,
  useScanDetail,
  useScanFindings,
  useStartIpScan,
  useStartDomainScan,
  useStartMobileScan,
} from "@/hooks/useScan";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockInvalidateQueries = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: mockUseQuery,
  useMutation: vi.fn(({ mutationFn, onSuccess }) => ({
    mutate: async (args: unknown) => {
      const result = await (
        mutationFn as (...args: unknown[]) => unknown
      )(args);
      if (onSuccess) onSuccess(result);
    },
    mutateAsync: async (args: unknown) => {
      const result = await (
        mutationFn as (...args: unknown[]) => unknown
      )(args);
      if (onSuccess) onSuccess(result);
      return result;
    },
    isError: false,
    isLoading: false,
    error: null,
    data: null,
  })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
  })),
  QueryClientProvider: ({ children }: { children: ReactNode; client: QueryClient }) =>
    children,
  QueryClient: class {},
}));

vi.mock("@/api/scans", () => ({
  getScanHistory: vi.fn(),
  getScan: vi.fn(),
  getScanFindings: vi.fn(),
  startIpScan: vi.fn(),
  startDomainScan: vi.fn(),
  startMobileScan: vi.fn(),
}));

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe("useScanHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls useQuery with scan-history key and params", () => {
    renderHook(() => useScanHistory(2, 10, "ip"), { wrapper: Wrapper });
    expect(mockUseQuery).toHaveBeenCalledWith({
      queryKey: ["scan-history", 2, 10, "ip"],
      queryFn: expect.any(Function),
    });
  });

  it("calls getScanHistory when queryFn executes", async () => {
    renderHook(() => useScanHistory(1, 20, "domain"), { wrapper: Wrapper });
    const { queryFn } = mockUseQuery.mock.calls[0][0];
    await queryFn();
    expect(getScanHistory).toHaveBeenCalledWith(1, 20, "domain");
  });
});

describe("useScanDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is disabled when jobId is null", () => {
    renderHook(() => useScanDetail(null), { wrapper: Wrapper });
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("is enabled when jobId is provided", () => {
    renderHook(() => useScanDetail("job-123"), { wrapper: Wrapper });
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it("has scan-detail query key with jobId", () => {
    renderHook(() => useScanDetail("job-123"), { wrapper: Wrapper });
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["scan-detail", "job-123"] }),
    );
  });
});

describe("useScanFindings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is disabled when jobId is null", () => {
    renderHook(() => useScanFindings(null), { wrapper: Wrapper });
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("has scan-findings query key with jobId", () => {
    renderHook(() => useScanFindings("job-123"), { wrapper: Wrapper });
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["scan-findings", "job-123"] }),
    );
  });
});

describe("useStartIpScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls startIpScan with target and ports", async () => {
    const { result } = renderHook(() => useStartIpScan(), {
      wrapper: Wrapper,
    });
    result.current.mutate({ target: "8.8.8.8", ports: "1-1000" });
    await waitFor(() => {
      expect(startIpScan).toHaveBeenCalledWith("8.8.8.8", "1-1000");
    });
  });

  it("invalidates scan-history on success", async () => {
    const { result } = renderHook(() => useStartIpScan(), {
      wrapper: Wrapper,
    });
    result.current.mutate({ target: "10.0.0.1" });
    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["scan-history"],
      });
    });
  });
});

describe("useStartDomainScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls startDomainScan with domain", async () => {
    const { result } = renderHook(() => useStartDomainScan(), {
      wrapper: Wrapper,
    });
    result.current.mutate({ domain: "example.com" });
    await waitFor(() => {
      expect(startDomainScan).toHaveBeenCalledWith("example.com");
    });
  });

  it("invalidates scan-history on success", async () => {
    const { result } = renderHook(() => useStartDomainScan(), {
      wrapper: Wrapper,
    });
    result.current.mutate({ domain: "test.com" });
    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["scan-history"],
      });
    });
  });
});

describe("useStartMobileScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls startMobileScan with file and platform", async () => {
    const { result } = renderHook(() => useStartMobileScan(), {
      wrapper: Wrapper,
    });
    const file = new File(["binary"], "test.apk");
    result.current.mutate({ file, platform: "android" });
    await waitFor(() => {
      expect(startMobileScan).toHaveBeenCalledWith(file, "android");
    });
  });

  it("invalidates scan-history on success", async () => {
    const { result } = renderHook(() => useStartMobileScan(), {
      wrapper: Wrapper,
    });
    const file = new File(["bin"], "test.ipa");
    result.current.mutate({ file, platform: "ios" });
    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["scan-history"],
      });
    });
  });
});
