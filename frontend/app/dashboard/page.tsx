"use client";

import { useState, useEffect, useCallback } from "react";
import { submitOptimization, getHistory } from "@/lib/apiClient";
import { TableResults } from "@/components/TableResults";
import type { HistoryItem } from "@/types";

export default function Dashboard() {
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [numCompetitors, setNumCompetitors] = useState(10);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filterStatus, setFilterStatus] = useState("");

  const fetchHistory = useCallback(async () => {
    try {
      const data = await getHistory({
        status: filterStatus || undefined,
      });
      setHistory(data);
    } catch {
      console.error("Failed to fetch history");
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Auto-refresh running jobs
  useEffect(() => {
    const hasRunning = history.some((j) => j.status === "pending" || j.status === "running");
    if (!hasRunning) return;

    const interval = setInterval(fetchHistory, 3000);
    return () => clearInterval(interval);
  }, [history, fetchHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setMessage("");

    try {
      const res = await submitOptimization({
        url,
        keyword: keyword || undefined,
        num_competitors: numCompetitors,
      });
      setMessage(`Job #${res.id} submitted — analyzing your page...`);
      setUrl("");
      setKeyword("");
      setTimeout(fetchHistory, 1500);
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">SEO Dashboard</h1>

      {/* Optimization Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-8"
      >
        <h2 className="text-lg font-semibold mb-4">Optimize a Page</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Page URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yoursite.com/page-to-optimize"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Primary Keyword <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. best seo tools 2025"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">
              Competitors to analyze: {numCompetitors}
            </label>
            <input
              type="range"
              min={3}
              max={10}
              value={numCompetitors}
              onChange={(e) => setNumCompetitors(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white font-medium px-8 py-2 rounded-lg transition whitespace-nowrap"
          >
            {loading ? "Submitting..." : "Run Optimization"}
          </button>
        </div>

        {message && (
          <p className={`mt-3 text-sm ${message.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
            {message}
          </p>
        )}
      </form>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="done">Done</option>
          <option value="failed">Failed</option>
        </select>
        <button
          onClick={fetchHistory}
          className="border border-gray-700 hover:border-gray-500 text-gray-300 text-sm px-4 py-2 rounded-lg transition"
        >
          Refresh
        </button>
      </div>

      {/* Results */}
      <TableResults items={history} onRefresh={fetchHistory} />
    </div>
  );
}
