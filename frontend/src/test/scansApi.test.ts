import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/store/authStore", () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ accessToken: null })),
  },
}));

vi.mock("axios", () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    post: vi.fn(),
    defaults: {},
    interceptors: {
      request: { use: vi.fn() },
    },
  };
  return {
    default: mockAxios,
  };
});

vi.stubGlobal("import", {
  meta: {
    env: {
      VITE_API_URL: "",
      VITE_WS_URL: "",
    },
  },
});

import axios from "axios";
import {
  startIpScan,
  startDomainScan,
  startMobileScan,
  getScan,
  getScanFindings,
  getScanHistory,
  getWsUrl,
} from "@/api/scans";
import type { ScanJob, ScanJobDetail, ScanFinding } from "@/api/scans";

const mockAxios = axios as unknown as ReturnType<typeof vi.fn> & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

describe("scans API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startIpScan", () => {
    it("posts to /api/scan/ip with target and ports", async () => {
      const mockResponse: ScanJob = {
        id: "ip-1",
        scan_type: "ip",
        target: "8.8.8.8",
        status: "running",
        progress: 0,
        result_summary: null,
        celery_task_id: "celery-1",
        started_at: null,
        completed_at: null,
        created_at: "2025-01-01T00:00:00Z",
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await startIpScan("8.8.8.8", "1-1000");
      expect(mockAxios.post).toHaveBeenCalledWith("/api/scan/ip", {
        target: "8.8.8.8",
        ports: "1-1000",
      });
      expect(result).toEqual(mockResponse);
    });

    it("uses default ports when not specified", async () => {
      mockAxios.post.mockResolvedValueOnce({ data: {} });
      await startIpScan("192.168.1.1");
      expect(mockAxios.post).toHaveBeenCalledWith("/api/scan/ip", {
        target: "192.168.1.1",
        ports: "1-1000",
      });
    });
  });

  describe("startDomainScan", () => {
    it("posts to /api/scan/domain with domain", async () => {
      const mockResponse: ScanJob = {
        id: "dom-1",
        scan_type: "domain",
        target: "example.com",
        status: "pending",
        progress: 0,
        result_summary: null,
        celery_task_id: null,
        started_at: null,
        completed_at: null,
        created_at: "2025-01-01T00:00:00Z",
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await startDomainScan("example.com");
      expect(mockAxios.post).toHaveBeenCalledWith("/api/scan/domain", {
        domain: "example.com",
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe("startMobileScan", () => {
    it("posts to /api/scan/mobile with FormData", async () => {
      const file = new File(["binary"], "test.apk", {
        type: "application/octet-stream",
      });
      mockAxios.post.mockResolvedValueOnce({ data: {} });

      await startMobileScan(file, "android");

      const call = mockAxios.post.mock.calls[0];
      expect(call[0]).toBe("/api/scan/mobile");
      expect(call[1]).toBeInstanceOf(FormData);
      expect(call[2]?.headers).toEqual({
        "Content-Type": "multipart/form-data",
      });
    });
  });

  describe("getScan", () => {
    it("gets scan detail by job ID", async () => {
      const mockDetail: ScanJobDetail = {
        id: "scan-1",
        scan_type: "ip",
        target: "10.0.0.1",
        status: "completed",
        progress: 100,
        result_summary: {
          total_findings: 5,
          critical: 1,
          high: 2,
          medium: 1,
          low: 1,
          info: 0,
        },
        celery_task_id: "ct-1",
        started_at: "2025-01-01T00:00:00Z",
        completed_at: "2025-01-01T00:01:00Z",
        created_at: "2025-01-01T00:00:00Z",
        findings: [],
      };
      mockAxios.get.mockResolvedValueOnce({ data: mockDetail });

      const result = await getScan("scan-1");
      expect(mockAxios.get).toHaveBeenCalledWith("/api/scan/scan-1");
      expect(result).toEqual(mockDetail);
    });
  });

  describe("getScanFindings", () => {
    it("gets findings for a job", async () => {
      const findings: ScanFinding[] = [
        {
          id: "f-1",
          job_id: "scan-1",
          severity: "critical",
          category: "vuln",
          title: "Open SSH port",
          description: "Port 22 is open",
          cve_id: "CVE-2024-0001",
          cvss_score: 9.8,
          remediation: "Disable SSH",
          raw_data: null,
          found_at: "2025-01-01T00:00:00Z",
        },
      ];
      mockAxios.get.mockResolvedValueOnce({ data: findings });

      const result = await getScanFindings("scan-1");
      expect(mockAxios.get).toHaveBeenCalledWith("/api/scan/scan-1/findings");
      expect(result).toEqual(findings);
    });
  });

  describe("getScanHistory", () => {
    it("gets paginated scan history", async () => {
      const mockResponse = {
        items: [] as ScanJob[],
        total: 0,
        page: 1,
        limit: 20,
        pages: 0,
      };
      mockAxios.get.mockResolvedValueOnce({ data: mockResponse });

      const result = await getScanHistory(1, 20);
      expect(mockAxios.get).toHaveBeenCalledWith("/api/scan/history", {
        params: { page: 1, limit: 20 },
      });
      expect(result).toEqual(mockResponse);
    });

    it("passes scanType filter when provided", async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });
      await getScanHistory(1, 10, "ip");
      expect(mockAxios.get).toHaveBeenCalledWith("/api/scan/history", {
        params: { page: 1, limit: 10, scan_type: "ip" },
      });
    });
  });

  describe("getWsUrl", () => {
    const originalLocation = window.location;

    beforeEach(() => {
      Object.defineProperty(window, "location", {
        value: { protocol: "http:", host: "localhost:5173" },
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });

    it("constructs WebSocket URL from window location", () => {
      const url = getWsUrl("job-1");
      expect(url).toBe("ws://localhost:5173/ws/scan/job-1");
    });

    it("uses wss:// for HTTPS pages", () => {
      Object.defineProperty(window, "location", {
        value: { protocol: "https:", host: "example.com" },
        writable: true,
      });
      const url = getWsUrl("job-1");
      expect(url).toBe("wss://example.com/ws/scan/job-1");
    });
  });
});
