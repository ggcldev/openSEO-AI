export interface ScrapeRequest {
  url: string;
  agent: "summarize" | "extract" | "raw";
  config?: Record<string, unknown>;
}

export interface ScrapeResponse {
  id: number;
  url: string;
  agent: string;
  status: string;
  message: string;
}

export interface HistoryItem {
  id: number;
  url: string;
  agent: string;
  status: "pending" | "running" | "done" | "failed";
  result: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface HistoryFilters {
  status?: string;
  agent?: string;
  url?: string;
  limit?: number;
}
