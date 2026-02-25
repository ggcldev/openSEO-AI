"use client";

import { useState, useEffect, useCallback } from "react";
import { submitOptimization, getHistory } from "@/lib/apiClient";
import { TableResults } from "@/components/TableResults";
import type { HistoryItem } from "@/types";

export default function Dashboard() {
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [goal, setGoal] = useState("leads");
  const [numCompetitors, setNumCompetitors] = useState(10);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filterStatus, setFilterStatus] = useState("");

  const fetchHistory = useCallback(async () => {
    try { setHistory(await getHistory({ status: filterStatus || undefined })); } catch {}
  }, [filterStatus]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);
  useEffect(() => {
    if (!history.some((j) => j.status === "pending" || j.status === "running")) return;
    const i = setInterval(fetchHistory, 3000);
    return () => clearInterval(i);
  }, [history, fetchHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await submitOptimization({
        url, keyword: keyword || undefined, goal, num_competitors: numCompetitors,
      });
      setMessage(`Job #${res.id} submitted`);
      setUrl("");
      setKeyword("");
      setTimeout(fetchHistory, 1500);
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-14">
        {/* URL input */}
        <div className="mb-3">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a URL to optimize"
            required
            className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg px-4 py-2.5 text-[14px] text-[#1a1a1a] placeholder-[#aaa] transition-colors" />
        </div>

        {/* Keyword + actions row */}
        <div className="flex gap-2 mb-3">
          <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)}
            placeholder="Primary keyword (optional)"
            className="flex-1 bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg px-4 py-2.5 text-[14px] text-[#1a1a1a] placeholder-[#aaa] transition-colors" />

          {/* Settings toggle */}
          <button type="button" onClick={() => setShowSettings(!showSettings)}
            className={`px-3 py-2.5 rounded-lg border transition-colors ${
              showSettings
                ? "bg-[#eee] border-[#ccc] text-[#1a1a1a]"
                : "bg-[#f5f5f5] border-[#e0e0e0] text-[#aaa] hover:text-[#666]"
            }`}
            title="Settings">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Submit */}
          <button type="submit" disabled={loading}
            className="bg-[#1a1a1a] text-[#fcfcfc] text-[13px] font-medium px-5 py-2.5 rounded-lg hover:bg-[#333] disabled:opacity-30 transition-colors">
            {loading ? "Running..." : "Optimize"}
          </button>
        </div>

        {/* Expandable settings */}
        {showSettings && (
          <div className="flex items-center gap-4 py-3 px-1 text-[13px]">
            <div className="flex items-center gap-2">
              <span className="text-[#aaa]">Goal</span>
              <select value={goal} onChange={(e) => setGoal(e.target.value)}
                className="bg-[#f5f5f5] border border-[#e0e0e0] rounded px-2 py-1 text-[12px] text-[#555] cursor-pointer">
                <option value="leads">Leads</option>
                <option value="awareness">Awareness</option>
                <option value="product_info">Product Info</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#aaa]">Competitors</span>
              <input type="range" min={3} max={10} value={numCompetitors}
                onChange={(e) => setNumCompetitors(Number(e.target.value))}
                className="w-16 accent-[#1a1a1a] h-1" />
              <span className="text-[#aaa] tabular-nums w-4">{numCompetitors}</span>
            </div>
          </div>
        )}

        {message && (
          <p className={`mt-2 text-[13px] ${message.startsWith("Error") ? "text-red-500" : "text-[#888]"}`}>
            {message}
          </p>
        )}
      </form>

      {/* Filter + Results */}
      <div className="flex items-center gap-3 mb-4">
        <p className="text-[13px] text-[#aaa]">History</p>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-[#f5f5f5] border border-[#e0e0e0] rounded px-2 py-1 text-[12px] text-[#888] cursor-pointer">
          <option value="">All</option>
          <option value="done">Done</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <TableResults items={history} onRefresh={fetchHistory} />
    </div>
  );
}
