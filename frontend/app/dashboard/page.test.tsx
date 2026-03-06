import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/app/dashboard/page";
import {
  bulkUploadXlsx,
  createSchedule,
  deactivateSchedule,
  getExportUrl,
  getHistory,
  getHistoryItem,
  getSchedules,
  getSourceExportUrl,
  optimizeExistingJob,
  runScheduleNow,
  submitScan,
} from "@/lib/apiClient";
import type { HistoryItem, OptimizeRequest, OptimizeResponse } from "@/types";

vi.mock("@/hooks/useClickOutside", () => ({
  useClickOutside: vi.fn(),
}));

vi.mock("@/hooks/useHistoryPolling", () => ({
  useHistoryPolling: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  bulkUploadXlsx: vi.fn(),
  createSchedule: vi.fn(),
  deactivateSchedule: vi.fn(),
  getExportUrl: vi.fn((id: number) => `/api/history/${id}/export`),
  getHistory: vi.fn(),
  getHistoryItem: vi.fn(),
  getSchedules: vi.fn(),
  getSourceExportUrl: vi.fn((id: number) => `/api/history/${id}/source`),
  optimizeExistingJob: vi.fn(),
  runScheduleNow: vi.fn(),
  submitScan: vi.fn(),
}));

function buildHistoryItem(overrides?: Partial<HistoryItem>): HistoryItem {
  return {
    id: 101,
    url: "https://example.com/page",
    keyword: "seamless gutters",
    goal: "leads",
    num_competitors: 10,
    pipeline_mode: "scan",
    status: "done",
    detected_intent: "commercial",
    page_type: "service",
    region: "US",
    language: "en",
    error_stage: null,
    error_code: null,
    error_message: null,
    audit_result: JSON.stringify({ overall_score: 82 }),
    has_source_html: true,
    has_export: false,
    can_optimize: true,
    created_at: "2026-03-06T00:00:00Z",
    finished_at: "2026-03-06T00:01:00Z",
    ...overrides,
  };
}

describe("Dashboard scan flow", () => {
  let historyStore: HistoryItem[];

  beforeEach(() => {
    vi.clearAllMocks();
    historyStore = [];

    vi.mocked(getHistory).mockImplementation(async () => historyStore);
    vi.mocked(getHistoryItem).mockImplementation(async (id: number) => {
      const found = historyStore.find((item) => item.id === id);
      if (!found) throw new Error("not found");
      return found;
    });
    vi.mocked(getSchedules).mockResolvedValue([]);
    vi.mocked(getExportUrl).mockImplementation((id: number) => `/api/history/${id}/export`);
    vi.mocked(getSourceExportUrl).mockImplementation((id: number) => `/api/history/${id}/source`);
    vi.mocked(bulkUploadXlsx).mockResolvedValue({
      submitted_count: 0,
      rejected_count: 0,
      submitted_job_ids: [],
      rejected_rows: [],
    });
    vi.mocked(createSchedule).mockRejectedValue(new Error("not used in this test"));
    vi.mocked(deactivateSchedule).mockRejectedValue(new Error("not used in this test"));
    vi.mocked(optimizeExistingJob).mockRejectedValue(new Error("not used in this test"));
    vi.mocked(runScheduleNow).mockRejectedValue(new Error("not used in this test"));
    vi.mocked(submitScan).mockImplementation(async (request: OptimizeRequest): Promise<OptimizeResponse> => {
      const item = buildHistoryItem({
        id: 101,
        url: request.url,
        keyword: request.keyword || "",
        goal: request.goal || "leads",
        num_competitors: request.num_competitors ?? 10,
      });
      historyStore = [item];
      return {
        id: item.id,
        url: item.url,
        keyword: item.keyword,
        status: item.status,
        pipeline_mode: item.pipeline_mode || "scan",
        message: "Scan queued.",
      };
    });
  });

  it("submits a scan and renders it in history", async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(getHistory).toHaveBeenCalled();
      expect(getSchedules).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText("Target URL"), {
      target: { value: "https://example.com/new-page" },
    });
    fireEvent.change(screen.getByLabelText("Primary Keyword"), {
      target: { value: "new keyword" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));

    await waitFor(() => {
      expect(submitScan).toHaveBeenCalledWith({
        url: "https://example.com/new-page",
        keyword: "new keyword",
        goal: "leads",
        num_competitors: 10,
      });
    });

    expect(await screen.findByText("Scan queued. Job #101.")).toBeInTheDocument();
    expect(await screen.findByText("https://example.com/new-page")).toBeInTheDocument();
  });

  it("derives keyword label from URL when the request keyword is blank", async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(getHistory).toHaveBeenCalled();
      expect(getSchedules).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText("Target URL"), {
      target: { value: "https://example.com/chemical-and-petrochemical" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));

    await waitFor(() => {
      expect(submitScan).toHaveBeenCalledWith({
        url: "https://example.com/chemical-and-petrochemical",
        keyword: undefined,
        goal: "leads",
        num_competitors: 10,
      });
    });

    expect(await screen.findByText("chemical and petrochemical")).toBeInTheDocument();
    expect(screen.queryByText("Untitled audit")).not.toBeInTheDocument();
  });
});
