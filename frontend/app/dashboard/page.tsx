"use client";

import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { JobDetailPanel } from "@/components/JobDetailPanel";
import { AutomationPanel } from "@/components/dashboard/AutomationPanel";
import { HistorySection } from "@/components/dashboard/HistorySection";
import { ScanForm } from "@/components/dashboard/ScanForm";
import {
  bulkUploadXlsx,
  createSchedule,
  deactivateSchedule,
  getHistory,
  getHistoryItem,
  getSchedules,
  optimizeExistingJob,
  runScheduleNow,
  submitScan,
} from "@/lib/apiClient";
import type { Goal, HistoryItem, ScheduleItem } from "@/types";
import {
  DASHBOARD_HISTORY_HIDDEN_POLL_MS,
  DASHBOARD_HISTORY_PENDING_POLL_MS,
  DASHBOARD_HISTORY_RUNNING_POLL_MS,
} from "@/lib/constants";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useHistoryPolling } from "@/hooks/useHistoryPolling";
import { Notice, setErrorNotice } from "@/lib/notice";

const GOAL_OPTIONS: Goal[] = ["leads", "awareness", "product_info"];
const JOB_STATUS_VALUES: HistoryItem["status"][] = ["pending", "running", "done", "failed"];
const PIPELINE_MODE_VALUES: NonNullable<HistoryItem["pipeline_mode"]>[] = [
  "scan",
  "full",
  "optimize",
];

interface ScheduleFormState {
  name: string;
  url: string;
  keyword: string;
  goal: Goal;
  numCompetitors: number;
  intervalMinutes: number;
}

const INITIAL_SCHEDULE_FORM: ScheduleFormState = {
  name: "",
  url: "",
  keyword: "",
  goal: "leads",
  numCompetitors: 10,
  intervalMinutes: 1440,
};

type ScheduleFormAction =
  | { type: "set_name"; value: string }
  | { type: "set_url"; value: string }
  | { type: "set_keyword"; value: string }
  | { type: "set_goal"; value: Goal }
  | { type: "set_num_competitors"; value: number }
  | { type: "set_interval_minutes"; value: number }
  | { type: "reset" };

function scheduleFormReducer(
  state: ScheduleFormState,
  action: ScheduleFormAction,
): ScheduleFormState {
  switch (action.type) {
    case "set_name":
      return { ...state, name: action.value };
    case "set_url":
      return { ...state, url: action.value };
    case "set_keyword":
      return { ...state, keyword: action.value };
    case "set_goal":
      return { ...state, goal: action.value };
    case "set_num_competitors":
      return { ...state, numCompetitors: action.value };
    case "set_interval_minutes":
      return { ...state, intervalMinutes: action.value };
    case "reset":
      return INITIAL_SCHEDULE_FORM;
    default:
      return state;
  }
}

function toGoal(value: string, fallback: Goal = "leads"): Goal {
  return GOAL_OPTIONS.includes(value as Goal) ? (value as Goal) : fallback;
}

function toNumberOrFallback(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeStatus(status: string): HistoryItem["status"] {
  return JOB_STATUS_VALUES.includes(status as HistoryItem["status"])
    ? (status as HistoryItem["status"])
    : "pending";
}

function normalizePipelineMode(mode: string): HistoryItem["pipeline_mode"] {
  return PIPELINE_MODE_VALUES.includes(mode as NonNullable<HistoryItem["pipeline_mode"]>)
    ? (mode as NonNullable<HistoryItem["pipeline_mode"]>)
    : "full";
}

function createOptimisticHistoryItem(input: {
  id: number;
  url: string;
  keyword?: string;
  goal?: Goal | null;
  numCompetitors?: number | null;
  status: HistoryItem["status"];
  pipelineMode: HistoryItem["pipeline_mode"];
}): HistoryItem {
  return {
    id: input.id,
    url: input.url,
    keyword: input.keyword || "",
    goal: input.goal ?? null,
    num_competitors: input.numCompetitors ?? null,
    pipeline_mode: input.pipelineMode,
    status: input.status,
    detected_intent: null,
    page_type: null,
    region: null,
    language: null,
    error_stage: null,
    error_code: null,
    error_message: null,
    audit_result: null,
    has_source_html: false,
    has_export: false,
    can_optimize: false,
    created_at: new Date().toISOString(),
    finished_at: null,
  };
}

export default function Dashboard() {
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [goal, setGoal] = useState<Goal>("leads");
  const [numCompetitors, setNumCompetitors] = useState(10);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Notice | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyMessage, setHistoryMessage] = useState<Notice | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [detailsJobId, setDetailsJobId] = useState<number | null>(null);
  const [detailsItem, setDetailsItem] = useState<HistoryItem | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [optimizingJobId, setOptimizingJobId] = useState<number | null>(null);
  const [retryScanJobId, setRetryScanJobId] = useState<number | null>(null);

  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<Notice | null>(null);

  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [scheduleForm, dispatchScheduleForm] = useReducer(
    scheduleFormReducer,
    INITIAL_SCHEDULE_FORM,
  );
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<Notice | null>(null);
  const [opsTab, setOpsTab] = useState<"bulk" | "schedule">("bulk");
  const [showAutomation, setShowAutomation] = useState(false);
  const automationMenuRef = useRef<HTMLDivElement | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const schedulesAbortRef = useRef<AbortController | null>(null);
  const detailsRequestRef = useRef(0);

  const fetchHistory = useCallback(async () => {
    const controller = new AbortController();
    historyAbortRef.current?.abort();
    historyAbortRef.current = controller;

    try {
      const items = await getHistory(
        { status: filterStatus || undefined, include_audit: false },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setHistory(items);
      setHistoryMessage(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorNotice(setHistoryMessage, err, "Failed to load audit runs");
    } finally {
      if (historyAbortRef.current === controller) {
        historyAbortRef.current = null;
      }
    }
  }, [filterStatus]);

  const fetchSchedules = useCallback(async () => {
    const controller = new AbortController();
    schedulesAbortRef.current?.abort();
    schedulesAbortRef.current = controller;

    try {
      const items = await getSchedules(undefined, controller.signal);
      if (controller.signal.aborted) return;
      setSchedules(items);
      setScheduleMessage(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorNotice(setScheduleMessage, err, "Failed to load schedules");
    } finally {
      if (schedulesAbortRef.current === controller) {
        schedulesAbortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      historyAbortRef.current?.abort();
      schedulesAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchSchedules();
  }, [fetchHistory, fetchSchedules]);

  useHistoryPolling({
    history,
    fetchHistory,
    runningIntervalMs: DASHBOARD_HISTORY_RUNNING_POLL_MS,
    pendingIntervalMs: DASHBOARD_HISTORY_PENDING_POLL_MS,
    hiddenIntervalMs: DASHBOARD_HISTORY_HIDDEN_POLL_MS,
  });

  useClickOutside(automationMenuRef, () => setShowAutomation(false), {
    enabled: showAutomation,
    closeOnEscape: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUrl = url.trim();
    const targetKeyword = keyword.trim();
    if (!targetUrl) return;

    setLoading(true);
    setMessage(null);
    try {
      const res = await submitScan({
        url: targetUrl,
        keyword: targetKeyword || undefined,
        goal,
        num_competitors: numCompetitors,
      });
      setMessage({ kind: "success", text: `${res.message} Job #${res.id}.` });
      setHistory((prev) => [
        createOptimisticHistoryItem({
          id: res.id,
          url: targetUrl,
          keyword: targetKeyword || res.keyword,
          goal,
          numCompetitors,
          status: normalizeStatus(res.status),
          pipelineMode: normalizePipelineMode(res.pipeline_mode),
        }),
        ...prev.filter((item) => item.id !== res.id),
      ]);
      setUrl("");
      setKeyword("");
      void fetchHistory();
    } catch (err) {
      setErrorNotice(setMessage, err, "Failed to submit scan.");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkFile) return;
    setBulkLoading(true);
    setBulkMessage(null);
    try {
      const result = await bulkUploadXlsx(bulkFile);
      setBulkMessage({
        kind: "success",
        text: `Queued ${result.submitted_count} jobs, rejected ${result.rejected_count} rows.`,
      });
      setBulkFile(null);
      void fetchHistory();
    } catch (err) {
      setErrorNotice(setBulkMessage, err, "Bulk upload failed.");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const scheduleName = scheduleForm.name.trim();
    const scheduleUrl = scheduleForm.url.trim();
    if (!scheduleName || !scheduleUrl) return;

    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      await createSchedule({
        name: scheduleName,
        url: scheduleUrl,
        keyword: scheduleForm.keyword.trim(),
        goal: scheduleForm.goal,
        num_competitors: scheduleForm.numCompetitors,
        interval_minutes: scheduleForm.intervalMinutes,
      });
      setScheduleMessage({ kind: "success", text: "Schedule created." });
      dispatchScheduleForm({ type: "reset" });
      await fetchSchedules();
    } catch (err) {
      setErrorNotice(setScheduleMessage, err, "Failed to create schedule.");
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleRunScheduleNow = async (scheduleId: number) => {
    setScheduleMessage(null);
    try {
      const result = await runScheduleNow(scheduleId);
      const targetSchedule = schedules.find((entry) => entry.id === scheduleId);
      setScheduleMessage({
        kind: "success",
        text: `Schedule ${scheduleId} queued job #${result.job_id}.`,
      });
      setHistory((prev) => [
        createOptimisticHistoryItem({
          id: result.job_id,
          url: targetSchedule?.url || `Schedule ${scheduleId}`,
          keyword: targetSchedule?.keyword || "",
          goal: targetSchedule?.goal || null,
          numCompetitors: targetSchedule?.num_competitors ?? null,
          status: "pending",
          pipelineMode: "full",
        }),
        ...prev.filter((item) => item.id !== result.job_id),
      ]);
      await fetchSchedules();
      void fetchHistory();
    } catch (err) {
      setErrorNotice(setScheduleMessage, err, "Failed to run schedule.");
    }
  };

  const handleDeactivateSchedule = async (scheduleId: number) => {
    setScheduleMessage(null);
    try {
      await deactivateSchedule(scheduleId);
      setScheduleMessage({
        kind: "success",
        text: `Schedule ${scheduleId} deactivated.`,
      });
      await fetchSchedules();
    } catch (err) {
      setErrorNotice(setScheduleMessage, err, "Failed to deactivate schedule.");
    }
  };

  const handleOptimizeFromHistory = async (jobId: number) => {
    setOptimizingJobId(jobId);
    setHistoryMessage(null);
    try {
      const res = await optimizeExistingJob(jobId);
      setHistoryMessage({ kind: "success", text: `${res.message} Job #${res.id}.` });
      setHistory((prev) =>
        prev.map((item) =>
          item.id === jobId
            ? {
                ...item,
                status: normalizeStatus(res.status),
                pipeline_mode: normalizePipelineMode(res.pipeline_mode),
                error_stage: null,
                error_code: null,
                error_message: null,
                has_export: false,
                can_optimize: false,
                finished_at: null,
              }
            : item,
        ),
      );
      void fetchHistory();
    } catch (err) {
      setErrorNotice(setHistoryMessage, err, "Failed to optimize job.");
    } finally {
      setOptimizingJobId(null);
    }
  };

  const handleRetryScanFromHistory = async (item: HistoryItem) => {
    setRetryScanJobId(item.id);
    setHistoryMessage(null);
    try {
      const res = await submitScan({
        url: item.url,
        keyword: item.keyword || undefined,
        goal: item.goal || "leads",
        num_competitors: item.num_competitors ?? 10,
      });
      setHistoryMessage({ kind: "success", text: `Scan retried as job #${res.id}.` });
      setHistory((prev) => [
        createOptimisticHistoryItem({
          id: res.id,
          url: item.url,
          keyword: item.keyword,
          goal: item.goal,
          numCompetitors: item.num_competitors,
          status: normalizeStatus(res.status),
          pipelineMode: normalizePipelineMode(res.pipeline_mode),
        }),
        ...prev.filter((entry) => entry.id !== res.id),
      ]);
      void fetchHistory();
    } catch (err) {
      setErrorNotice(setHistoryMessage, err, "Failed to retry scan.");
    } finally {
      setRetryScanJobId(null);
    }
  };

  const handleOpenEditor = useCallback((jobId: number) => {
    const url = `/editor/${jobId}?version=source`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const handleOpenDetails = useCallback(
    (jobId: number) => {
      const requestId = detailsRequestRef.current + 1;
      detailsRequestRef.current = requestId;
      setDetailsJobId(jobId);
      setDetailsLoading(true);
      setDetailsItem(history.find((entry) => entry.id === jobId) ?? null);

      void getHistoryItem(jobId)
        .then((fullItem) => {
          if (detailsRequestRef.current !== requestId) return;
          setDetailsItem(fullItem);
        })
        .catch((err) => {
          if (detailsRequestRef.current !== requestId) return;
          setErrorNotice(setHistoryMessage, err, "Failed to load audit details");
        })
        .finally(() => {
          if (detailsRequestRef.current !== requestId) return;
          setDetailsLoading(false);
        });
    },
    [history],
  );

  const handleCloseDetails = useCallback(() => {
    detailsRequestRef.current += 1;
    setDetailsJobId(null);
    setDetailsItem(null);
    setDetailsLoading(false);
  }, []);

  const selectedDetailsJob = detailsJobId ? detailsItem : null;

  return (
    <div className="space-y-8">
      <section className="bg-white pb-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-[#171b29]">SEO Optimization</h1>
            <p className="mt-1 text-[14px] text-[#6f7891]">
              Scan first. Then optimize from the result row, or open it manually in the editor.
            </p>
          </div>
          <AutomationPanel
            showAutomation={showAutomation}
            onToggleAutomation={() => setShowAutomation((value) => !value)}
            automationMenuRef={automationMenuRef}
            opsTab={opsTab}
            onOpsTabChange={setOpsTab}
            bulkFile={bulkFile}
            bulkLoading={bulkLoading}
            bulkMessage={bulkMessage}
            onBulkUpload={handleBulkUpload}
            onBulkFileChange={setBulkFile}
            scheduleForm={scheduleForm}
            scheduleLoading={scheduleLoading}
            scheduleMessage={scheduleMessage}
            schedules={schedules}
            onCreateSchedule={handleCreateSchedule}
            onScheduleNameChange={(value) => dispatchScheduleForm({ type: "set_name", value })}
            onScheduleUrlChange={(value) => dispatchScheduleForm({ type: "set_url", value })}
            onScheduleKeywordChange={(value) => dispatchScheduleForm({ type: "set_keyword", value })}
            onScheduleGoalChange={(value) =>
              dispatchScheduleForm({ type: "set_goal", value: toGoal(value, scheduleForm.goal) })
            }
            onScheduleNumCompetitorsChange={(value) =>
              dispatchScheduleForm({
                type: "set_num_competitors",
                value: toNumberOrFallback(value, scheduleForm.numCompetitors),
              })
            }
            onScheduleIntervalMinutesChange={(value) =>
              dispatchScheduleForm({
                type: "set_interval_minutes",
                value: toNumberOrFallback(value, scheduleForm.intervalMinutes),
              })
            }
            onRunScheduleNow={handleRunScheduleNow}
            onDeactivateSchedule={handleDeactivateSchedule}
          />
        </div>
        <ScanForm
          url={url}
          keyword={keyword}
          showSettings={showSettings}
          goal={goal}
          numCompetitors={numCompetitors}
          loading={loading}
          message={message}
          onSubmit={handleSubmit}
          onUrlChange={setUrl}
          onKeywordChange={setKeyword}
          onToggleSettings={() => setShowSettings((value) => !value)}
          onGoalChange={(value) => setGoal(toGoal(value, goal))}
          onNumCompetitorsChange={(value) =>
            setNumCompetitors(toNumberOrFallback(value, numCompetitors))
          }
        />
      </section>

      <HistorySection
        filterStatus={filterStatus}
        historyMessage={historyMessage}
        items={history}
        optimizingJobId={optimizingJobId}
        onFilterStatusChange={setFilterStatus}
        onOpenEditor={handleOpenEditor}
        onOpenDetails={handleOpenDetails}
        onOptimizeJob={handleOptimizeFromHistory}
      />

      <JobDetailPanel
        item={selectedDetailsJob}
        loadingAudit={detailsLoading}
        onClose={handleCloseDetails}
        onRetryScan={handleRetryScanFromHistory}
        onOptimizeJob={handleOptimizeFromHistory}
        onOpenEditor={handleOpenEditor}
        retryScanJobId={retryScanJobId}
        optimizingJobId={optimizingJobId}
      />
    </div>
  );
}
