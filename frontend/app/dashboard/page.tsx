"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { JobDetailPanel } from "@/components/JobDetailPanel";
import { TableResults } from "@/components/TableResults";
import {
  bulkUploadXlsx,
  createSchedule,
  deactivateSchedule,
  getHistory,
  getSchedules,
  optimizeExistingJob,
  runScheduleNow,
  submitScan,
} from "@/lib/apiClient";
import type { HistoryItem, ScheduleItem } from "@/types";

export default function Dashboard() {
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [goal, setGoal] = useState("leads");
  const [numCompetitors, setNumCompetitors] = useState(10);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyMessage, setHistoryMessage] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [detailsJobId, setDetailsJobId] = useState<number | null>(null);
  const [optimizingJobId, setOptimizingJobId] = useState<number | null>(null);
  const [retryScanJobId, setRetryScanJobId] = useState<number | null>(null);

  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");

  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleUrl, setScheduleUrl] = useState("");
  const [scheduleKeyword, setScheduleKeyword] = useState("");
  const [scheduleGoal, setScheduleGoal] = useState("leads");
  const [scheduleNumCompetitors, setScheduleNumCompetitors] = useState(10);
  const [scheduleIntervalMinutes, setScheduleIntervalMinutes] = useState(1440);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [opsTab, setOpsTab] = useState<"bulk" | "schedule">("bulk");
  const [showAutomation, setShowAutomation] = useState(false);
  const automationMenuRef = useRef<HTMLDivElement | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const items = await getHistory({ status: filterStatus || undefined });
      setHistory(items);
      setHistoryMessage("");
    } catch (err) {
      setHistoryMessage(`Error: ${err instanceof Error ? err.message : "Failed to load history"}`);
    }
  }, [filterStatus]);

  const fetchSchedules = useCallback(async () => {
    try {
      setSchedules(await getSchedules());
      setScheduleMessage("");
    } catch (err) {
      setScheduleMessage(`Error: ${err instanceof Error ? err.message : "Failed to load schedules"}`);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchSchedules();
  }, [fetchHistory, fetchSchedules]);

  useEffect(() => {
    if (!history.some((j) => j.status === "pending" || j.status === "running")) return;
    const i = setInterval(() => {
      fetchHistory();
    }, 3000);
    return () => clearInterval(i);
  }, [history, fetchHistory]);

  useEffect(() => {
    if (!showAutomation) return;

    function onPointerDown(event: MouseEvent) {
      if (!automationMenuRef.current) return;
      if (automationMenuRef.current.contains(event.target as Node)) return;
      setShowAutomation(false);
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowAutomation(false);
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [showAutomation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await submitScan({
        url,
        keyword: keyword || undefined,
        goal,
        num_competitors: numCompetitors,
      });
      setMessage(`${res.message} Job #${res.id}.`);
      setUrl("");
      setKeyword("");
      setTimeout(() => {
        fetchHistory();
      }, 1500);
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkFile) return;
    setBulkLoading(true);
    setBulkMessage("");
    try {
      const result = await bulkUploadXlsx(bulkFile);
      setBulkMessage(`Queued ${result.submitted_count} jobs, rejected ${result.rejected_count} rows.`);
      setBulkFile(null);
      setTimeout(() => {
        fetchHistory();
      }, 1500);
    } catch (err) {
      setBulkMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleName.trim() || !scheduleUrl.trim()) return;
    setScheduleLoading(true);
    setScheduleMessage("");
    try {
      await createSchedule({
        name: scheduleName.trim(),
        url: scheduleUrl.trim(),
        keyword: scheduleKeyword.trim(),
        goal: scheduleGoal as "leads" | "awareness" | "product_info",
        num_competitors: scheduleNumCompetitors,
        interval_minutes: scheduleIntervalMinutes,
      });
      setScheduleMessage("Schedule created.");
      setScheduleName("");
      setScheduleUrl("");
      setScheduleKeyword("");
      await fetchSchedules();
    } catch (err) {
      setScheduleMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleRunScheduleNow = async (scheduleId: number) => {
    setScheduleMessage("");
    try {
      const result = await runScheduleNow(scheduleId);
      setScheduleMessage(`Schedule ${scheduleId} queued job #${result.job_id}.`);
      await fetchSchedules();
      setTimeout(() => {
        fetchHistory();
      }, 1500);
    } catch (err) {
      setScheduleMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleDeactivateSchedule = async (scheduleId: number) => {
    setScheduleMessage("");
    try {
      await deactivateSchedule(scheduleId);
      setScheduleMessage(`Schedule ${scheduleId} deactivated.`);
      await fetchSchedules();
    } catch (err) {
      setScheduleMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleOptimizeFromHistory = async (jobId: number) => {
    setOptimizingJobId(jobId);
    setHistoryMessage("");
    try {
      const res = await optimizeExistingJob(jobId);
      setHistoryMessage(`${res.message} Job #${res.id}.`);
      setTimeout(() => {
        fetchHistory();
      }, 1500);
    } catch (err) {
      setHistoryMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setOptimizingJobId(null);
    }
  };

  const handleRetryScanFromHistory = async (item: HistoryItem) => {
    setRetryScanJobId(item.id);
    setHistoryMessage("");
    try {
      const res = await submitScan({
        url: item.url,
        keyword: item.keyword || undefined,
        goal: item.goal || "leads",
        num_competitors: item.num_competitors ?? 10,
      });
      setHistoryMessage(`Scan retried as job #${res.id}.`);
      setTimeout(() => {
        fetchHistory();
      }, 1500);
    } catch (err) {
      setHistoryMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRetryScanJobId(null);
    }
  };

  const handleOpenEditor = useCallback((jobId: number) => {
    const url = `/editor/${jobId}?version=source`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const selectedDetailsJob = detailsJobId ? history.find((h) => h.id === detailsJobId) ?? null : null;

  return (
    <div className="space-y-8">
      <section className="border border-[#e8e8e8] rounded-2xl p-6 bg-white">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold text-[#1a1a1a]">SEO Optimization</h1>
            <p className="text-[13px] text-[#888] mt-1">
              Scan first. Then optimize from the result row, or open it manually in the editor.
            </p>
          </div>

          <div ref={automationMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowAutomation((v) => !v)}
              className="h-[38px] px-3 rounded-lg border border-[#ddd] text-[12px] text-[#555] hover:border-[#bbb] bg-white"
            >
              {showAutomation ? "Close Automation" : "Automation"}
            </button>

            {showAutomation && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-20 w-[min(92vw,760px)] rounded-xl border border-[#e8e8e8] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.12)] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#efefef]">
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">Batch & Automation</p>
                  <p className="text-[12px] text-[#888] mt-0.5">Bulk upload and recurring scan operations.</p>
                </div>

                <div className="p-4 max-h-[70vh] overflow-auto">
                  <div className="inline-flex p-1 bg-[#f4f4f4] rounded-lg mb-4">
                    <button
                      type="button"
                      onClick={() => setOpsTab("bulk")}
                      className={`px-3 py-1.5 text-[12px] rounded-md ${opsTab === "bulk" ? "bg-white border border-[#ddd] text-[#1a1a1a]" : "text-[#777]"}`}
                    >
                      Bulk Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpsTab("schedule")}
                      className={`px-3 py-1.5 text-[12px] rounded-md ${opsTab === "schedule" ? "bg-white border border-[#ddd] text-[#1a1a1a]" : "text-[#777]"}`}
                    >
                      Schedules
                    </button>
                  </div>

                  {opsTab === "bulk" && (
                    <form onSubmit={handleBulkUpload} className="space-y-3">
                      <p className="text-[12px] text-[#777]">
                        Expected columns: <code>url</code> (required), <code>keyword</code>, <code>goal</code>,{" "}
                        <code>num_competitors</code>
                      </p>
                      <input
                        type="file"
                        accept=".xlsx"
                        onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                        className="w-full text-[12px] text-[#666] border border-[#e0e0e0] rounded-lg px-3 py-2 bg-[#f7f7f7]"
                      />
                      <button
                        type="submit"
                        disabled={bulkLoading || !bulkFile}
                        className="bg-[#1a1a1a] text-[#fcfcfc] text-[12px] font-medium px-4 py-2 rounded-lg hover:bg-[#333] disabled:opacity-30"
                      >
                        {bulkLoading ? "Uploading..." : "Upload & Queue"}
                      </button>
                      {bulkMessage && (
                        <p className={`text-[12px] ${bulkMessage.startsWith("Error") ? "text-red-600" : "text-[#666]"}`}>
                          {bulkMessage}
                        </p>
                      )}
                    </form>
                  )}

                  {opsTab === "schedule" && (
                    <div className="grid lg:grid-cols-2 gap-4">
                      <form onSubmit={handleCreateSchedule} className="space-y-3">
                        <input
                          type="text"
                          value={scheduleName}
                          onChange={(e) => setScheduleName(e.target.value)}
                          placeholder="Schedule name"
                          className="w-full bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]"
                          required
                        />
                        <input
                          type="url"
                          value={scheduleUrl}
                          onChange={(e) => setScheduleUrl(e.target.value)}
                          placeholder="https://example.com/page"
                          className="w-full bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]"
                          required
                        />
                        <input
                          type="text"
                          value={scheduleKeyword}
                          onChange={(e) => setScheduleKeyword(e.target.value)}
                          placeholder="Keyword (optional)"
                          className="w-full bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={scheduleGoal}
                            onChange={(e) => setScheduleGoal(e.target.value)}
                            className="bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-2 py-2 text-[12px]"
                          >
                            <option value="leads">Leads</option>
                            <option value="awareness">Awareness</option>
                            <option value="product_info">Product Info</option>
                          </select>
                          <input
                            type="number"
                            min={3}
                            max={20}
                            value={scheduleNumCompetitors}
                            onChange={(e) => setScheduleNumCompetitors(Number(e.target.value))}
                            className="bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-2 py-2 text-[12px]"
                            title="Competitors"
                          />
                          <input
                            type="number"
                            min={15}
                            max={10080}
                            value={scheduleIntervalMinutes}
                            onChange={(e) => setScheduleIntervalMinutes(Number(e.target.value))}
                            className="bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-2 py-2 text-[12px]"
                            title="Interval minutes"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={scheduleLoading}
                          className="bg-[#1a1a1a] text-[#fcfcfc] text-[12px] font-medium px-4 py-2 rounded-lg hover:bg-[#333] disabled:opacity-30"
                        >
                          {scheduleLoading ? "Creating..." : "Create Schedule"}
                        </button>
                        {scheduleMessage && (
                          <p className={`text-[12px] ${scheduleMessage.startsWith("Error") ? "text-red-600" : "text-[#666]"}`}>
                            {scheduleMessage}
                          </p>
                        )}
                      </form>

                      <div className="border border-[#eee] rounded-xl p-3 max-h-64 overflow-auto space-y-2">
                        {schedules.map((s) => (
                          <div key={s.id} className="border border-[#eee] rounded-lg p-2 text-[12px]">
                            <p className="text-[#1a1a1a] font-medium">{s.name}</p>
                            <p className="text-[#888] truncate">{s.url}</p>
                            <p className="text-[#aaa]">
                              Every {s.interval_minutes} min • next {new Date(s.next_run_at).toLocaleString()}
                            </p>
                            <div className="flex gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => handleRunScheduleNow(s.id)}
                                disabled={!s.is_active}
                                className="border border-[#ddd] text-[#444] text-[11px] px-2 py-1 rounded hover:border-[#bbb] disabled:opacity-40"
                              >
                                Run now
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeactivateSchedule(s.id)}
                                disabled={!s.is_active}
                                className="border border-[#ddd] text-[#444] text-[11px] px-2 py-1 rounded hover:border-[#bbb] disabled:opacity-40"
                              >
                                Deactivate
                              </button>
                            </div>
                          </div>
                        ))}
                        {schedules.length === 0 && <p className="text-[12px] text-[#aaa]">No schedules yet</p>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="single-url" className="text-[12px] text-[#777] uppercase tracking-wider">
              Target URL
            </label>
            <input
              id="single-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/page"
              required
              className="w-full bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-4 py-2.5 text-[14px] text-[#1a1a1a] placeholder-[#aaa]"
            />
          </div>

          <div className="grid md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div className="space-y-2">
              <label htmlFor="single-keyword" className="text-[12px] text-[#777] uppercase tracking-wider">
                Primary Keyword
              </label>
              <input
                id="single-keyword"
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Optional"
                className="w-full bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-4 py-2.5 text-[14px] text-[#1a1a1a] placeholder-[#aaa]"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="h-[42px] px-3 rounded-lg border border-[#e0e0e0] bg-[#f7f7f7] text-[13px] text-[#666] hover:border-[#cfcfcf]"
            >
              {showSettings ? "Hide Advanced" : "Advanced"}
            </button>

            <button
              type="submit"
              disabled={loading}
              className="h-[42px] px-5 rounded-lg bg-[#1a1a1a] text-[#fcfcfc] text-[13px] font-medium hover:bg-[#333] disabled:opacity-30"
            >
              {loading ? "Scanning..." : "Scan"}
            </button>
          </div>

          {showSettings && (
            <div className="border border-[#ececec] rounded-xl p-4 grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="single-goal" className="text-[12px] text-[#777] uppercase tracking-wider">
                  Goal
                </label>
                <select
                  id="single-goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] text-[#555]"
                >
                  <option value="leads">Leads</option>
                  <option value="awareness">Awareness</option>
                  <option value="product_info">Product Info</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="single-competitors" className="text-[12px] text-[#777] uppercase tracking-wider">
                  Competitors ({numCompetitors})
                </label>
                <input
                  id="single-competitors"
                  type="range"
                  min={3}
                  max={20}
                  value={numCompetitors}
                  onChange={(e) => setNumCompetitors(Number(e.target.value))}
                  className="w-full accent-[#1a1a1a]"
                />
              </div>
            </div>
          )}

          {message && (
            <p className={`text-[13px] ${message.startsWith("Error") ? "text-red-600" : "text-[#666]"}`}>
              {message}
            </p>
          )}
        </form>
      </section>

      <section className="border border-[#e8e8e8] rounded-2xl p-6 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#1a1a1a]">History</h2>
            <p className="text-[12px] text-[#888] mt-1">
              Scan creates the baseline. Optimize generates the HTML output.
            </p>
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-[#f7f7f7] border border-[#e0e0e0] rounded px-2 py-1.5 text-[12px] text-[#666]"
          >
            <option value="">All statuses</option>
            <option value="done">Done</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {historyMessage && (
          <p className={`text-[12px] mb-3 ${historyMessage.startsWith("Error") ? "text-red-600" : "text-[#666]"}`}>
            {historyMessage}
          </p>
        )}
        <TableResults
          items={history}
          onOpenEditor={handleOpenEditor}
          onOpenDetails={setDetailsJobId}
          onOptimizeJob={handleOptimizeFromHistory}
          optimizingJobId={optimizingJobId}
        />
      </section>

      <JobDetailPanel
        item={selectedDetailsJob}
        onClose={() => setDetailsJobId(null)}
        onRetryScan={handleRetryScanFromHistory}
        onOptimizeJob={handleOptimizeFromHistory}
        onOpenEditor={handleOpenEditor}
        retryScanJobId={retryScanJobId}
        optimizingJobId={optimizingJobId}
      />
    </div>
  );
}
