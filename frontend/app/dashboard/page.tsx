"use client";

import { useState, useEffect, useCallback } from "react";
import { submitOptimization, getHistory } from "@/lib/apiClient";
import { TableResults } from "@/components/TableResults";
import type { HistoryItem } from "@/types";

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
    } finally { setLoading(false); }
  };

  const selectClass = "bg-[#1e1e1e] border border-[#303030] rounded-lg px-3 py-2 text-[13px] text-[#ccc] cursor-pointer transition-colors";
  const inputClass = "w-full bg-[#1e1e1e] border border-[#303030] rounded-lg px-4 py-2.5 text-[14px] text-white placeholder-[#555] transition-colors";

  return (
    <div>
      {/* Form */}
      <form onSubmit={handleSubmit} className="mb-14">
        {/* URL */}
        <div className="mb-4">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a URL to optimize" required className={inputClass} />
        </div>

        {/* Keyword */}
        <div className="mb-5">
          <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)}
            placeholder="Primary keyword (optional)" className={inputClass} />
        </div>

        {/* Settings row */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <select value={pageType} onChange={(e) => setPageType(e.target.value)} className={selectClass}>
            <option value="service">Service</option>
            <option value="product">Product</option>
            <option value="landing">Landing</option>
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className={selectClass}>
            <option value="global">Global</option>
            <option value="apac">APAC</option>
            <option value="emea">EMEA</option>
            <option value="nam">NAM</option>
            <option value="latam">LATAM</option>
          </select>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className={selectClass}>
            <option value="en">English</option>
            <option value="de">German</option>
            <option value="fr">French</option>
            <option value="es">Spanish</option>
            <option value="pt">Portuguese</option>
            <option value="zh">Chinese</option>
            <option value="ja">Japanese</option>
          </select>
          <select value={goal} onChange={(e) => setGoal(e.target.value)} className={selectClass}>
            <option value="leads">Leads</option>
            <option value="awareness">Awareness</option>
            <option value="product_info">Product Info</option>
          </select>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[12px] text-[#777]">{numCompetitors} competitors</span>
            <input type="range" min={3} max={10} value={numCompetitors}
              onChange={(e) => setNumCompetitors(Number(e.target.value))}
              className="w-20 accent-white h-1" />
          </div>
        </div>

        {/* Submit */}
        <button type="submit" disabled={loading}
          className="bg-white text-[#161616] text-[13px] font-medium px-6 py-2.5 rounded-lg hover:bg-[#e0e0e0] disabled:opacity-30 transition-colors">
          {loading ? "Submitting..." : "Run Optimization"}
        </button>

        {message && (
          <span className={`ml-4 text-[13px] ${message.startsWith("Error") ? "text-red-400" : "text-[#999]"}`}>
            {message}
          </span>
        )}
      </form>

      {/* Filter + Results */}
      <div className="flex items-center gap-3 mb-4">
        <p className="text-[13px] text-[#777]">History</p>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-[#1e1e1e] border border-[#303030] rounded px-2 py-1 text-[12px] text-[#999] cursor-pointer">
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
