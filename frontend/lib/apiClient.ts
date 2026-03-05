import type {
  BulkUploadResponse,
  EditorDocument,
  HistoryFilters,
  HistoryItem,
  OptimizeRequest,
  OptimizeResponse,
  ReliabilitySummary,
  ScheduleCreateRequest,
  ScheduleItem,
} from "@/types";

// Empty string means same-origin (recommended for hosted demo/prod behind proxy/rewrites).
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function submitOptimization(data: OptimizeRequest): Promise<OptimizeResponse> {
  return fetchAPI("/api/optimize", { method: "POST", body: JSON.stringify(data) });
}

export async function submitScan(data: OptimizeRequest): Promise<OptimizeResponse> {
  return fetchAPI("/api/scan", { method: "POST", body: JSON.stringify(data) });
}

export async function optimizeExistingJob(jobId: number): Promise<OptimizeResponse> {
  return fetchAPI(`/api/optimize/${jobId}`, { method: "POST" });
}

export async function getHistory(filters?: HistoryFilters): Promise<HistoryItem[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.keyword) params.set("keyword", filters.keyword);
  if (filters?.url) params.set("url", filters.url);
  if (filters?.limit) params.set("limit", String(filters.limit));
  const query = params.toString();
  return fetchAPI(`/api/history${query ? `?${query}` : ""}`);
}

export async function getHistoryItem(id: number): Promise<HistoryItem> {
  return fetchAPI(`/api/history/${id}`);
}

export function getExportUrl(id: number): string {
  return `${API_BASE}/api/export/${id}`;
}

export function getSourceExportUrl(id: number): string {
  return `${API_BASE}/api/export/${id}?version=source`;
}

export async function getEditorDocument(id: number): Promise<EditorDocument> {
  return fetchAPI(`/api/editor/${id}`);
}

export async function saveEditorDocument(
  id: number,
  optimizedHtml: string,
): Promise<EditorDocument> {
  return fetchAPI(`/api/editor/${id}`, {
    method: "PUT",
    body: JSON.stringify({ optimized_html: optimizedHtml }),
  });
}

export async function bulkUploadXlsx(file: File): Promise<BulkUploadResponse> {
  const qs = new URLSearchParams({ filename: file.name || "upload.xlsx" });
  const res = await fetch(`${API_BASE}/api/bulk/upload?${qs.toString()}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getSchedules(active?: boolean): Promise<ScheduleItem[]> {
  const params = new URLSearchParams();
  if (active !== undefined) params.set("active", String(active));
  const query = params.toString();
  return fetchAPI(`/api/schedules${query ? `?${query}` : ""}`);
}

export async function createSchedule(data: ScheduleCreateRequest): Promise<ScheduleItem> {
  return fetchAPI("/api/schedules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function runScheduleNow(
  id: number,
): Promise<{ schedule_id: number; job_id: number; status: string }> {
  return fetchAPI(`/api/schedules/${id}/run-now`, { method: "POST" });
}

export async function deactivateSchedule(id: number): Promise<ScheduleItem> {
  return fetchAPI(`/api/schedules/${id}`, { method: "DELETE" });
}

export async function getReliabilitySummary(windowDays = 30): Promise<ReliabilitySummary> {
  const params = new URLSearchParams({ window_days: String(windowDays) });
  return fetchAPI(`/api/reliability/summary?${params.toString()}`);
}
