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
import type { ZodType } from "zod";
import {
  bulkUploadResponseSchema,
  editorDocumentSchema,
  historyItemSchema,
  historyItemsSchema,
  optimizeResponseSchema,
  reliabilitySummarySchema,
  runScheduleNowResponseSchema,
  scheduleItemSchema,
  scheduleItemsSchema,
} from "@/lib/apiSchemas";

export type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ApiClientDependencies {
  fetchFn?: ApiFetch;
  baseUrl?: string;
  getAuthHeaderValue?: () => string | null;
}

export interface ApiClient {
  submitOptimization(data: OptimizeRequest): Promise<OptimizeResponse>;
  submitScan(data: OptimizeRequest): Promise<OptimizeResponse>;
  optimizeExistingJob(jobId: number): Promise<OptimizeResponse>;
  getHistory(filters?: HistoryFilters, signal?: AbortSignal): Promise<HistoryItem[]>;
  getHistoryItem(id: number): Promise<HistoryItem>;
  getExportUrl(id: number): string;
  getSourceExportUrl(id: number): string;
  getEditorDocument(id: number): Promise<EditorDocument>;
  saveEditorDocument(id: number, optimizedHtml: string): Promise<EditorDocument>;
  bulkUploadXlsx(file: File): Promise<BulkUploadResponse>;
  getSchedules(active?: boolean, signal?: AbortSignal): Promise<ScheduleItem[]>;
  createSchedule(data: ScheduleCreateRequest): Promise<ScheduleItem>;
  runScheduleNow(id: number): Promise<{ schedule_id: number; job_id: number; status: string }>;
  deactivateSchedule(id: number): Promise<ScheduleItem>;
  getReliabilitySummary(windowDays?: number): Promise<ReliabilitySummary>;
}

// Empty string means same-origin (recommended for hosted demo/prod behind proxy/rewrites).
function resolveApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }

    // Keep origin + pathname, but avoid trailing slash to keep `/api/...` concatenation stable.
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    if (typeof console !== "undefined") {
      console.warn(
        "[apiClient] Ignoring invalid NEXT_PUBLIC_API_URL; falling back to same-origin requests.",
      );
    }
    return "";
  }
}

const API_BASE = resolveApiBase();

function resolveAuthHeaderValue(): string | null {
  if (typeof window !== "undefined") {
    const runtimeToken = window.localStorage.getItem("OPENSEO_API_TOKEN")?.trim();
    if (runtimeToken) {
      return runtimeToken.toLowerCase().startsWith("bearer ")
        ? runtimeToken
        : `Bearer ${runtimeToken}`;
    }
  }
  return null;
}

function resolveRuntimeFetch(): ApiFetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof globalThis.fetch !== "function") {
      throw new Error("Fetch API is not available in this environment.");
    }
    return globalThis.fetch(input, init);
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function parseWithSchema<T>(schema: ZodType<T>, payload: unknown, context: string): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }
  const issue = parsed.error.issues[0];
  throw new Error(
    `Invalid API response for ${context}: ${issue?.path.join(".") || "root"} ${issue?.message ?? "validation failed"}`,
  );
}

/**
 * Creates an API client with injectable dependencies.
 * @param deps Optional overrides for fetch/base URL/auth header resolver.
 * @returns Bound API client instance.
 */
export function createApiClient(deps: ApiClientDependencies = {}): ApiClient {
  const fetchFn = deps.fetchFn ?? resolveRuntimeFetch();
  const baseUrl = normalizeBaseUrl(deps.baseUrl ?? API_BASE);
  const getAuthHeaderValue = deps.getAuthHeaderValue ?? resolveAuthHeaderValue;

  async function fetchAPI<T>(
    path: string,
    options?: RequestInit,
    schema?: ZodType<T>,
  ): Promise<T> {
    const headers = new Headers(options?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const authHeader = getAuthHeaderValue();
    if (authHeader && !headers.has("Authorization")) {
      headers.set("Authorization", authHeader);
    }

    const res = await fetchFn(`${baseUrl}${path}`, {
      ...options,
      headers,
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    const payload: unknown = await res.json();
    if (!schema) {
      return payload as T;
    }
    return parseWithSchema(schema, payload, path);
  }

  return {
    /**
     * Submit a full optimization request and queue optimization pipeline work.
     * @param data Optimization request payload.
     * @returns Job creation response for the queued optimization.
     */
    async submitOptimization(data: OptimizeRequest): Promise<OptimizeResponse> {
      return fetchAPI(
        "/api/optimize",
        { method: "POST", body: JSON.stringify(data) },
        optimizeResponseSchema,
      );
    },

    /**
     * Submit a scan-only request to crawl and audit a URL.
     * @param data Scan request payload.
     * @returns Job creation response for the queued scan.
     */
    async submitScan(data: OptimizeRequest): Promise<OptimizeResponse> {
      return fetchAPI(
        "/api/scan",
        { method: "POST", body: JSON.stringify(data) },
        optimizeResponseSchema,
      );
    },

    /**
     * Trigger optimization for an existing job record.
     * @param jobId Existing job id.
     * @returns Updated job response from the optimize endpoint.
     */
    async optimizeExistingJob(jobId: number): Promise<OptimizeResponse> {
      return fetchAPI(`/api/optimize/${jobId}`, { method: "POST" }, optimizeResponseSchema);
    },

    /**
     * Fetch paginated or filtered history items.
     * @param filters Optional history filters.
     * @param signal Optional abort signal for cancellation.
     * @returns Matching history items.
     */
    async getHistory(filters?: HistoryFilters, signal?: AbortSignal): Promise<HistoryItem[]> {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.keyword) params.set("keyword", filters.keyword);
      if (filters?.url) params.set("url", filters.url);
      if (filters?.limit) params.set("limit", String(filters.limit));
      if (typeof filters?.include_audit === "boolean") {
        params.set("include_audit", String(filters.include_audit));
      }
      const query = params.toString();
      return fetchAPI(`/api/history${query ? `?${query}` : ""}`, { signal }, historyItemsSchema);
    },

    /**
     * Fetch a single history item by id.
     * @param id Job/history id.
     * @returns History item details.
     */
    async getHistoryItem(id: number): Promise<HistoryItem> {
      return fetchAPI(`/api/history/${id}`, undefined, historyItemSchema);
    },

    /**
     * Build the download URL for optimized HTML export.
     * @param id Job id.
     * @returns Absolute or relative export URL.
     */
    getExportUrl(id: number): string {
      return `${baseUrl}/api/export/${id}`;
    },

    /**
     * Build the download URL for original source HTML export.
     * @param id Job id.
     * @returns Absolute or relative source export URL.
     */
    getSourceExportUrl(id: number): string {
      return `${baseUrl}/api/export/${id}?version=source`;
    },

    /**
     * Retrieve editor document payload for a job.
     * @param id Job id.
     * @returns Editor document containing HTML and metadata.
     */
    async getEditorDocument(id: number): Promise<EditorDocument> {
      return fetchAPI(`/api/editor/${id}`, undefined, editorDocumentSchema);
    },

    /**
     * Persist optimized HTML for an editor job.
     * @param id Job id.
     * @param optimizedHtml Final edited HTML content.
     * @returns Updated editor document payload.
     */
    async saveEditorDocument(id: number, optimizedHtml: string): Promise<EditorDocument> {
      return fetchAPI(
        `/api/editor/${id}`,
        {
          method: "PUT",
          body: JSON.stringify({ optimized_html: optimizedHtml }),
        },
        editorDocumentSchema,
      );
    },

    /**
     * Upload an XLSX file and queue bulk jobs.
     * @param file XLSX file to upload.
     * @returns Bulk upload summary and queued/rejected counts.
     */
    async bulkUploadXlsx(file: File): Promise<BulkUploadResponse> {
      const qs = new URLSearchParams({ filename: file.name || "upload.xlsx" });
      const res = await fetchFn(`${baseUrl}/api/bulk/upload?${qs.toString()}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
      const payload: unknown = await res.json();
      return parseWithSchema(bulkUploadResponseSchema, payload, "/api/bulk/upload");
    },

    /**
     * Fetch schedule records.
     * @param active Optional active-state filter.
     * @param signal Optional abort signal for cancellation.
     * @returns Schedule list.
     */
    async getSchedules(active?: boolean, signal?: AbortSignal): Promise<ScheduleItem[]> {
      const params = new URLSearchParams();
      if (active !== undefined) params.set("active", String(active));
      const query = params.toString();
      return fetchAPI(
        `/api/schedules${query ? `?${query}` : ""}`,
        { signal },
        scheduleItemsSchema,
      );
    },

    /**
     * Create a recurring schedule.
     * @param data Schedule payload.
     * @returns Persisted schedule object.
     */
    async createSchedule(data: ScheduleCreateRequest): Promise<ScheduleItem> {
      return fetchAPI(
        "/api/schedules",
        {
          method: "POST",
          body: JSON.stringify(data),
        },
        scheduleItemSchema,
      );
    },

    /**
     * Trigger an immediate run for a schedule.
     * @param id Schedule id.
     * @returns Schedule/job mapping for the queued run.
     */
    async runScheduleNow(id: number): Promise<{ schedule_id: number; job_id: number; status: string }> {
      return fetchAPI(
        `/api/schedules/${id}/run-now`,
        { method: "POST" },
        runScheduleNowResponseSchema,
      );
    },

    /**
     * Deactivate a schedule.
     * @param id Schedule id.
     * @returns Updated schedule record.
     */
    async deactivateSchedule(id: number): Promise<ScheduleItem> {
      return fetchAPI(`/api/schedules/${id}`, { method: "DELETE" }, scheduleItemSchema);
    },

    /**
     * Fetch reliability summary metrics for a time window.
     * @param windowDays Number of days to include; defaults to 30.
     * @returns Reliability summary payload.
     */
    async getReliabilitySummary(windowDays = 30): Promise<ReliabilitySummary> {
      const params = new URLSearchParams({ window_days: String(windowDays) });
      return fetchAPI(
        `/api/reliability/summary?${params.toString()}`,
        undefined,
        reliabilitySummarySchema,
      );
    },
  };
}

const defaultApiClient = createApiClient();

/**
 * Submit a full optimization request and queue optimization pipeline work.
 * @param data Optimization request payload.
 * @returns Job creation response for the queued optimization.
 */
export async function submitOptimization(data: OptimizeRequest): Promise<OptimizeResponse> {
  return defaultApiClient.submitOptimization(data);
}

/**
 * Submit a scan-only request to crawl and audit a URL.
 * @param data Scan request payload.
 * @returns Job creation response for the queued scan.
 */
export async function submitScan(data: OptimizeRequest): Promise<OptimizeResponse> {
  return defaultApiClient.submitScan(data);
}

/**
 * Trigger optimization for an existing job record.
 * @param jobId Existing job id.
 * @returns Updated job response from the optimize endpoint.
 */
export async function optimizeExistingJob(jobId: number): Promise<OptimizeResponse> {
  return defaultApiClient.optimizeExistingJob(jobId);
}

/**
 * Fetch paginated or filtered history items.
 * @param filters Optional history filters.
 * @param signal Optional abort signal for cancellation.
 * @returns Matching history items.
 */
export async function getHistory(
  filters?: HistoryFilters,
  signal?: AbortSignal,
): Promise<HistoryItem[]> {
  return defaultApiClient.getHistory(filters, signal);
}

/**
 * Fetch a single history item by id.
 * @param id Job/history id.
 * @returns History item details.
 */
export async function getHistoryItem(id: number): Promise<HistoryItem> {
  return defaultApiClient.getHistoryItem(id);
}

/**
 * Build the download URL for optimized HTML export.
 * @param id Job id.
 * @returns Absolute or relative export URL.
 */
export function getExportUrl(id: number): string {
  return defaultApiClient.getExportUrl(id);
}

/**
 * Build the download URL for original source HTML export.
 * @param id Job id.
 * @returns Absolute or relative source export URL.
 */
export function getSourceExportUrl(id: number): string {
  return defaultApiClient.getSourceExportUrl(id);
}

/**
 * Retrieve editor document payload for a job.
 * @param id Job id.
 * @returns Editor document containing HTML and metadata.
 */
export async function getEditorDocument(id: number): Promise<EditorDocument> {
  return defaultApiClient.getEditorDocument(id);
}

/**
 * Persist optimized HTML for an editor job.
 * @param id Job id.
 * @param optimizedHtml Final edited HTML content.
 * @returns Updated editor document payload.
 */
export async function saveEditorDocument(
  id: number,
  optimizedHtml: string,
): Promise<EditorDocument> {
  return defaultApiClient.saveEditorDocument(id, optimizedHtml);
}

/**
 * Upload an XLSX file and queue bulk jobs.
 * @param file XLSX file to upload.
 * @returns Bulk upload summary and queued/rejected counts.
 */
export async function bulkUploadXlsx(file: File): Promise<BulkUploadResponse> {
  return defaultApiClient.bulkUploadXlsx(file);
}

/**
 * Fetch schedule records.
 * @param active Optional active-state filter.
 * @param signal Optional abort signal for cancellation.
 * @returns Schedule list.
 */
export async function getSchedules(
  active?: boolean,
  signal?: AbortSignal,
): Promise<ScheduleItem[]> {
  return defaultApiClient.getSchedules(active, signal);
}

/**
 * Create a recurring schedule.
 * @param data Schedule payload.
 * @returns Persisted schedule object.
 */
export async function createSchedule(data: ScheduleCreateRequest): Promise<ScheduleItem> {
  return defaultApiClient.createSchedule(data);
}

/**
 * Trigger an immediate run for a schedule.
 * @param id Schedule id.
 * @returns Schedule/job mapping for the queued run.
 */
export async function runScheduleNow(
  id: number,
): Promise<{ schedule_id: number; job_id: number; status: string }> {
  return defaultApiClient.runScheduleNow(id);
}

/**
 * Deactivate a schedule.
 * @param id Schedule id.
 * @returns Updated schedule record.
 */
export async function deactivateSchedule(id: number): Promise<ScheduleItem> {
  return defaultApiClient.deactivateSchedule(id);
}

/**
 * Fetch reliability summary metrics for a time window.
 * @param windowDays Number of days to include; defaults to 30.
 * @returns Reliability summary payload.
 */
export async function getReliabilitySummary(windowDays = 30): Promise<ReliabilitySummary> {
  return defaultApiClient.getReliabilitySummary(windowDays);
}
