"use client";

import { useState, useEffect, useCallback } from "react";
import { submitOptimization, getHistory } from "@/lib/apiClient";
import { TableResults } from "@/components/TableResults";
import type { HistoryItem } from "@/types";

const REGIONS = [
  { value: "global", label: "Global" },
  { value: "apac", label: "APAC" },
  { value: "emea", label: "EMEA" },
  { value: "nam", label: "North America" },
  { value: "latam", label: "Latin America" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
];

export default function Dashboard() {
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [pageType, setPageType] = useState("service");
  const [region, setRegion] = useState("global");
  const [language, setLanguage] = useState("en");
  const [goal, setGoal] = useState("leads");
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
      const res = await submitOptimization({
        url, keyword: keyword || undefined,
        page_type_input: pageType, region, language, goal,
        num_competitors: numCompetitors,
      });
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
          {/* Row 1: URL + Keyword */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div>
              <label className="block text-[12px] text-[#999] mb-2 uppercase tracking-wider">Page URL</label>
              <input
                type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.hitachienergy.com/..."
                required
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-[14px] text-white placeholder-[#555] transition-colors duration-200"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#999] mb-2 uppercase tracking-wider">
                Primary Keyword <span className="text-[#666] normal-case">(optional)</span>
              </label>
              <input
                type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. renewable energy solutions"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-[14px] text-white placeholder-[#555] transition-colors duration-200"
              />
            </div>
          </div>

          {/* Row 2: Page Type + Region + Language + Goal */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <div>
              <label className="block text-[12px] text-[#999] mb-2 uppercase tracking-wider">Page Type</label>
              <select value={pageType} onChange={(e) => setPageType(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-[13px] text-white cursor-pointer">
                <option value="service">Service</option>
                <option value="product">Product</option>
                <option value="landing">Landing</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-[#999] mb-2 uppercase tracking-wider">Region</label>
              <select value={region} onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-[13px] text-white cursor-pointer">
                {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-[#999] mb-2 uppercase tracking-wider">Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-[13px] text-white cursor-pointer">
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-[#999] mb-2 uppercase tracking-wider">Goal</label>
              <select value={goal} onChange={(e) => setGoal(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-[13px] text-white cursor-pointer">
                <option value="leads">Leads</option>
                <option value="awareness">Awareness</option>
                <option value="product_info">Product Info</option>
              </select>
            </div>
          </div>

          {/* Row 3: Competitors slider + Submit */}
          <div className="flex items-end gap-5">
            <div className="flex-1">
              <label className="block text-[12px] text-[#999] mb-2 uppercase tracking-wider">
                Competitors: {numCompetitors}
              </label>
              <input type="range" min={3} max={10} value={numCompetitors}
                onChange={(e) => setNumCompetitors(Number(e.target.value))}
                className="w-full accent-white h-1" />
            </div>
            <button type="submit" disabled={loading}
              className="bg-white text-[#111] text-[13px] font-medium px-6 py-2.5 rounded-lg hover:bg-[#ddd] disabled:opacity-30 transition-colors duration-200 whitespace-nowrap">
              {loading ? "Submitting..." : "Run Optimization"}
            </button>
          </div>

          {message && (
            <p className={`mt-4 text-[13px] ${message.startsWith("Error") ? "text-red-400" : "text-[#aaa]"}`}>
              {message}
            </p>
          )}
        </div>
      </form>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[13px] text-[#aaa] cursor-pointer">
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
