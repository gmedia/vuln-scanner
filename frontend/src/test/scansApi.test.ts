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
  getScanFinding,
  getScanFindings,
  getScanHistory,
  getWsUrl,
  printFile,
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
          impact: "Exposed SSH can enable remote shell access.",
          attacker_benefit:
            "Open SSH is a known brute-force and key-guessing target.",
          raw_data: null,
          found_at: "2025-01-01T00:00:00Z",
        },
      ];
      const page = {
        items: findings,
        total: 1,
        page: 1,
        limit: 50,
        pages: 1,
      };
      mockAxios.get.mockResolvedValueOnce({ data: page });

      const result = await getScanFindings("scan-1");
      expect(mockAxios.get).toHaveBeenCalledWith("/api/scan/scan-1/findings", {
        params: { page: 1, limit: 50 },
      });
      expect(result).toEqual(page);
    });

    it("passes severity filter when provided", async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });
      await getScanFindings("scan-1", 1, 50, "high");
      expect(mockAxios.get).toHaveBeenCalledWith("/api/scan/scan-1/findings", {
        params: { page: 1, limit: 50, severity: "high" },
      });
    });

    it("passes q search when provided", async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });
      await getScanFindings("scan-1", 2, 25, "medium", "ssh");
      expect(mockAxios.get).toHaveBeenCalledWith("/api/scan/scan-1/findings", {
        params: { page: 2, limit: 25, severity: "medium", q: "ssh" },
      });
    });
  });

  describe("getScanFinding", () => {
    it("gets a single finding with raw_data", async () => {
      const finding: ScanFinding = {
        id: "f-1",
        job_id: "scan-1",
        severity: "critical",
        category: "vuln",
        title: "Open SSH port",
        description: "Port 22 is open",
        cve_id: null,
        cvss_score: null,
        remediation: null,
        impact: null,
        attacker_benefit: null,
        raw_data: { banner: "OpenSSH" },
        found_at: "2025-01-01T00:00:00Z",
      };
      mockAxios.get.mockResolvedValueOnce({ data: finding });
      const result = await getScanFinding("scan-1", "f-1");
      expect(mockAxios.get).toHaveBeenCalledWith(
        "/api/scan/scan-1/findings/f-1",
      );
      expect(result).toEqual(finding);
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

  describe("printFile", () => {
    function mockPrintTab() {
      const print = vi.fn();
      const focus = vi.fn();
      const close = vi.fn();
      const documentOpen = vi.fn();
      const documentWrite = vi.fn();
      const documentClose = vi.fn();
      const tab = {
        print,
        focus,
        close,
        document: {
          open: documentOpen,
          write: documentWrite,
          close: documentClose,
        },
      };
      return { tab, print, focus, close, documentWrite };
    }

    it("opens about:blank before the export fetch resolves and prints without download", async () => {
      localStorage.setItem("sinexis.locale", "id");
      const order: string[] = [];
      let resolveGet!: (value: { data: Blob }) => void;
      mockAxios.get.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            order.push("fetch-start");
            resolveGet = (value) => {
              order.push("fetch-resolve");
              resolve(value);
            };
          }),
      );
      const { tab, print, focus, documentWrite } = mockPrintTab();
      const open = vi.spyOn(window, "open").mockImplementation(() => {
        order.push("open");
        return tab as unknown as Window;
      });
      const createElement = vi.spyOn(document, "createElement");

      const pending = printFile("scan-1", "executive");

      expect(open).toHaveBeenCalledWith("about:blank", "_blank");
      expect(order[0]).toBe("open");
      expect(order.indexOf("open")).toBeLessThan(order.indexOf("fetch-start"));
      expect(print).not.toHaveBeenCalled();

      resolveGet({
        data: new Blob(["<html>exec</html>"], { type: "text/html" }),
      });
      await pending;

      expect(mockAxios.get).toHaveBeenCalledWith("/api/scan/scan-1/export", {
        params: { format: "executive", lang: "id" },
        responseType: "blob",
      });
      expect(documentWrite).toHaveBeenCalledWith("<html>exec</html>");
      expect(focus).toHaveBeenCalled();
      expect(print).toHaveBeenCalled();
      expect(createElement.mock.calls.some((c) => c[0] === "a")).toBe(false);
      expect(document.querySelector("a[download]")).toBeNull();

      createElement.mockRestore();
      open.mockRestore();
      localStorage.removeItem("sinexis.locale");
    });

    it("throws popup_blocked when window.open returns null", async () => {
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      await expect(printFile("scan-1", "html")).rejects.toThrow(
        "popup_blocked",
      );
      expect(open).toHaveBeenCalledWith("about:blank", "_blank");
      expect(mockAxios.get).not.toHaveBeenCalled();
      open.mockRestore();
    });

    it("closes the tab if the export fetch fails", async () => {
      const { tab, close, print } = mockPrintTab();
      const open = vi
        .spyOn(window, "open")
        .mockReturnValue(tab as unknown as Window);
      mockAxios.get.mockRejectedValueOnce(new Error("export_failed"));

      await expect(printFile("scan-1", "html")).rejects.toThrow(
        "export_failed",
      );
      expect(close).toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();
      open.mockRestore();
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
