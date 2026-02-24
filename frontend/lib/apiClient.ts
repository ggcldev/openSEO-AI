import type { OptimizeRequest, OptimizeResponse, HistoryItem, HistoryFilters } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error ${res.status}: ${error}`);
  }

  return res.json();
}

export async function submitOptimization(data: OptimizeRequest): Promise<OptimizeResponse> {
  return fetchAPI<OptimizeResponse>("/api/optimize", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getHistory(filters?: HistoryFilters): Promise<HistoryItem[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.keyword) params.set("keyword", filters.keyword);
  if (filters?.url) params.set("url", filters.url);
  if (filters?.limit) params.set("limit", String(filters.limit));

  const query = params.toString();
  return fetchAPI<HistoryItem[]>(`/api/history${query ? `?${query}` : ""}`);
}

export async function getJob(id: number): Promise<HistoryItem> {
  return fetchAPI<HistoryItem>(`/api/history/${id}`);
}

export function getExportUrl(id: number): string {
  return `${API_BASE}/api/export/${id}`;
}
