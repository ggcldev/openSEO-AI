"use client";

import { useState, useEffect } from "react";
import { submitScrape, getHistory } from "@/lib/apiClient";
import { TableResults } from "@/components/TableResults";
import type { HistoryItem } from "@/types";

export default function Dashboard() {
  const [url, setUrl] = useState("");
  const [agent, setAgent] = useState<"summarize" | "extract" | "raw">("summarize");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAgent, setFilterAgent] = useState("");

  const fetchHistory = async () => {
    try {
      const data = await getHistory({
        status: filterStatus || undefined,
        agent: filterAgent || undefined,
      });
      setHistory(data);
    } catch {
      console.error("Failed to fetch history");
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [filterStatus, filterAgent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setMessage("");

    try {
      const res = await submitScrape({ url, agent });
      setMessage(`Job #${res.id} submitted (${res.status})`);
      setUrl("");
      // Refresh history after a short delay to allow processing
      setTimeout(fetchHistory, 2000);
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      {/* Scrape Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-8"
      >
        <h2 className="text-lg font-semibold mb-4">New Scrape</h2>
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value as typeof agent)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="summarize">Summarize</option>
            <option value="extract">Extract</option>
            <option value="raw">Raw</option>
          </select>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white font-medium px-6 py-2 rounded-lg transition"
          >
            {loading ? "Submitting..." : "Scrape"}
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
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">All Agents</option>
          <option value="summarize">Summarize</option>
          <option value="extract">Extract</option>
          <option value="raw">Raw</option>
        </select>
        <button
          onClick={fetchHistory}
          className="border border-gray-700 hover:border-gray-500 text-gray-300 text-sm px-4 py-2 rounded-lg transition"
        >
          Refresh
        </button>
      </div>

      {/* Results Table */}
      <TableResults items={history} onRefresh={fetchHistory} />
    </div>
  );
}
