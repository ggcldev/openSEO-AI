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
      const data = await getHistory({ status: filterStatus || undefined });
      setHistory(data);
    } catch {
      console.error("Failed to fetch history");
    }
  }, [filterStatus]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

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
      const res = await submitOptimization({ url, keyword: keyword || undefined, num_competitors: numCompetitors });
      setMessage(`Job #${res.id} submitted`);
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
      <h1 className="text-[22px] font-semibold tracking-tight mb-8 text-white">Dashboard</h1>

      <form onSubmit={handleSubmit} className="mb-12">
        <div className="border border-[#2a2a2a] rounded-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div>
              <label className="block text-[12px] text-[#999] mb-2 uppercase tracking-wider">Page URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yoursite.com/page"
                required
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-[14px] text-white placeholder-[#555] transition-colors duration-200"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#999] mb-2 uppercase tracking-wider">
                Primary Keyword <span className="text-[#666] normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. best seo tools 2025"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-[14px] text-white placeholder-[#555] transition-colors duration-200"
              />
            </div>
          </div>

          <div className="flex items-end gap-5">
            <div className="flex-1">
              <label className="block text-[12px] text-[#999] mb-2 uppercase tracking-wider">
                Competitors: {numCompetitors}
              </label>
              <input
                type="range" min={3} max={10} value={numCompetitors}
                onChange={(e) => setNumCompetitors(Number(e.target.value))}
                className="w-full accent-white h-1"
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="bg-white text-[#111] text-[13px] font-medium px-6 py-2.5 rounded-lg hover:bg-[#ddd] disabled:opacity-30 transition-colors duration-200 whitespace-nowrap"
            >
              {loading ? "Submitting..." : "Run analysis"}
            </button>
          </div>

          {message && (
            <p className={`mt-4 text-[13px] ${message.startsWith("Error") ? "text-red-400" : "text-[#aaa]"}`}>
              {message}
            </p>
          )}
        </div>
      </form>

      <div className="flex items-center gap-3 mb-5">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[13px] text-[#aaa] cursor-pointer transition-colors duration-200"
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="done">Done</option>
          <option value="failed">Failed</option>
        </select>
        <button onClick={fetchHistory} className="text-[13px] text-[#777] hover:text-white transition-colors duration-200">
          Refresh
        </button>
      </div>

      <TableResults items={history} onRefresh={fetchHistory} />
    </div>
  );
}
