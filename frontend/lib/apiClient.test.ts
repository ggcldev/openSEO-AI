import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApiClient,
  getHistory,
  getHistoryItem,
  saveEditorDocument,
} from "@/lib/apiClient";

function mockFetchJson(payload: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
}

describe("apiClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("adds Authorization header when OPENSEO_API_TOKEN is present", async () => {
    window.localStorage.setItem("OPENSEO_API_TOKEN", "token-123");
    const fetchMock = mockFetchJson([]);
    vi.stubGlobal("fetch", fetchMock);

    await getHistory({ status: "done", limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/history?status=done&limit=10");
    const headers = new Headers(options.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-123");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("supports dependency injection for fetch/base/auth resolvers", async () => {
    const fetchMock = mockFetchJson([]);
    const api = createApiClient({
      fetchFn: fetchMock,
      baseUrl: "https://api.example.test",
      getAuthHeaderValue: () => "Bearer injected-token",
    });

    await api.getHistory({ status: "running", limit: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.test/api/history?status=running&limit=5");
    const headers = new Headers(options.headers);
    expect(headers.get("Authorization")).toBe("Bearer injected-token");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("serializes include_audit filter for history requests", async () => {
    const fetchMock = mockFetchJson([]);
    const api = createApiClient({
      fetchFn: fetchMock,
      baseUrl: "https://api.example.test",
    });

    await api.getHistory({ status: "done", include_audit: true, limit: 3 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.test/api/history?status=done&limit=3&include_audit=true");
  });

  it("persists optimized HTML via PUT /api/editor/{id}", async () => {
    const fetchMock = mockFetchJson({
      id: 99,
      url: "https://example.com",
      status: "done",
      source_html: "<p>source</p>",
      optimized_html: "<p>optimized</p>",
      created_at: "2026-01-01T00:00:00Z",
      finished_at: "2026-01-01T00:01:00Z",
    });
    vi.stubGlobal("fetch", fetchMock);

    await saveEditorDocument(99, "<p>optimized</p>");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/editor/99");
    expect(options.method).toBe("PUT");
    expect(options.body).toBe(JSON.stringify({ optimized_html: "<p>optimized</p>" }));
  });

  it("throws readable API errors when response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service unavailable",
      json: async () => ({ detail: "Service unavailable" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHistory()).rejects.toThrow("API error 503: Service unavailable");
  });

  it("throws validation errors for malformed API payloads", async () => {
    const fetchMock = mockFetchJson({});
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHistoryItem(42)).rejects.toThrow("Invalid API response for /api/history/42");
  });
});
