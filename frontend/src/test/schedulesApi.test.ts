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
    patch: vi.fn(),
    delete: vi.fn(),
    defaults: {},
    interceptors: {
      request: { use: vi.fn() },
    },
  };
  return {
    default: mockAxios,
  };
});

import axios from "axios";
import {
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  listScheduleRuns,
  MAX_ENABLED_SCHEDULES,
} from "@/api/schedules";

const mockAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe("schedules API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports max enabled constant", () => {
    expect(MAX_ENABLED_SCHEDULES).toBe(10);
  });

  it("listSchedules hits GET /api/schedules", async () => {
    mockAxios.get.mockResolvedValue({ data: [] });
    await listSchedules();
    expect(mockAxios.get).toHaveBeenCalledWith("/api/schedules");
  });

  it("createSchedule posts payload", async () => {
    mockAxios.post.mockResolvedValue({ data: { id: "1" } });
    await createSchedule({
      scan_type: "domain",
      target: "example.com",
      cadence: "weekly",
      notify_email: "a@b.co",
    });
    expect(mockAxios.post).toHaveBeenCalledWith("/api/schedules", {
      scan_type: "domain",
      target: "example.com",
      cadence: "weekly",
      notify_email: "a@b.co",
    });
  });

  it("updateSchedule patches by id", async () => {
    mockAxios.patch.mockResolvedValue({ data: { id: "1", enabled: false } });
    await updateSchedule("1", { enabled: false });
    expect(mockAxios.patch).toHaveBeenCalledWith("/api/schedules/1", {
      enabled: false,
    });
  });

  it("deleteSchedule deletes by id", async () => {
    mockAxios.delete.mockResolvedValue({});
    await deleteSchedule("1");
    expect(mockAxios.delete).toHaveBeenCalledWith("/api/schedules/1");
  });

  it("listScheduleRuns hits runs endpoint with limit", async () => {
    mockAxios.get.mockResolvedValue({ data: [] });
    await listScheduleRuns("sched-9", 5);
    expect(mockAxios.get).toHaveBeenCalledWith("/api/schedules/sched-9/runs", {
      params: { limit: 5 },
    });
  });
});
