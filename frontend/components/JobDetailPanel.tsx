"use client";

import type { AuditResult, HistoryItem } from "@/types";
import { getExportUrl, getSourceExportUrl } from "@/lib/apiClient";

interface Props {
  item: HistoryItem | null;
  onClose: () => void;
  onRetryScan: (item: HistoryItem) => void;
  onOptimizeJob: (jobId: number) => void;
  onOpenEditor: (jobId: number) => void;
  retryScanJobId: number | null;
  optimizingJobId: number | null;
}

type StepState = "done" | "in_progress" | "failed" | "pending";

function parseAudit(auditResult: string | null): AuditResult | null {
  if (!auditResult) return null;
  try {
    return JSON.parse(auditResult) as AuditResult;
  } catch {
    return null;
  }
}

function stepText(state: StepState): string {
  if (state === "done") return "Done";
  if (state === "in_progress") return "In Progress";
  if (state === "failed") return "Failed";
  return "Pending";
}

function stepClass(state: StepState): string {
  if (state === "done") return "text-[#1a1a1a] bg-[#ededed]";
  if (state === "in_progress") return "text-[#1a1a1a] bg-[#f4f4f4]";
  if (state === "failed") return "text-red-700 bg-red-50";
  return "text-[#888] bg-[#f7f7f7]";
}

function computeTimeline(item: HistoryItem, audit: AuditResult | null): Array<{ label: string; state: StepState }> {
  const scanState: StepState = item.has_source_html
    ? "done"
    : item.pipeline_mode === "scan" && (item.status === "pending" || item.status === "running")
      ? "in_progress"
      : item.status === "failed" && !item.has_source_html
        ? "failed"
        : "pending";

  const hasAudit = !!item.audit_result;
  const auditState: StepState = hasAudit && !audit?.parse_error
    ? "done"
    : item.error_stage === "audit" || !!audit?.parse_error
      ? "failed"
      : item.has_source_html
        ? "pending"
        : "pending";

  const optimizeState: StepState = item.has_export
    ? "done"
    : (item.pipeline_mode === "optimize" || item.pipeline_mode === "full") &&
        (item.status === "pending" || item.status === "running")
      ? "in_progress"
      : item.status === "failed" &&
          (item.error_stage === "editor" ||
            item.pipeline_mode === "optimize" ||
            item.pipeline_mode === "full")
        ? "failed"
        : "pending";

  return [
    { label: "Scan", state: scanState },
    { label: "Audit", state: auditState },
    { label: "Optimize", state: optimizeState },
  ];
}

export function JobDetailPanel({
  item,
  onClose,
  onRetryScan,
  onOptimizeJob,
  onOpenEditor,
  retryScanJobId,
  optimizingJobId,
}: Props) {
  if (!item) return null;

  const audit = parseAudit(item.audit_result);
  const timeline = computeTimeline(item, audit);
  const retryScanLoading = retryScanJobId === item.id;
  const optimizeLoading = optimizingJobId === item.id;

  return (
    <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] p-5">
      <div className="h-full max-w-3xl ml-auto bg-white rounded-xl border border-[#dcdcdc] shadow-xl flex flex-col">
        <div className="px-5 py-4 border-b border-[#e8e8e8] flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#aaa]">Job Details</p>
            <p className="text-[13px] text-[#1a1a1a] break-all">{item.url}</p>
            <p className="text-[12px] text-[#888] mt-1">
              Job #{item.id} • {item.status} • {item.pipeline_mode || "full"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-[#ddd] text-[#444] text-[13px] px-3 py-2 rounded-lg hover:border-[#bbb]"
          >
            Close
          </button>
        </div>

        <div className="p-5 overflow-auto space-y-6">
          <section className="space-y-2">
            <p className="text-[11px] text-[#aaa] uppercase tracking-wider">Phase Timeline</p>
            <div className="grid grid-cols-3 gap-2">
              {timeline.map((step) => (
                <div key={step.label} className={`rounded-lg border border-[#ececec] p-3 ${stepClass(step.state)}`}>
                  <p className="text-[11px] uppercase tracking-wider">{step.label}</p>
                  <p className="text-[13px] font-medium mt-1">{stepText(step.state)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-[11px] text-[#aaa] uppercase tracking-wider">Actions</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onRetryScan(item)}
                disabled={retryScanLoading || item.status === "pending" || item.status === "running"}
                className="border border-[#ddd] text-[#444] text-[13px] px-3 py-2 rounded-lg hover:border-[#bbb] disabled:opacity-40"
              >
                {retryScanLoading ? "Retrying Scan..." : "Retry Scan"}
              </button>
              <button
                type="button"
                onClick={() => onOptimizeJob(item.id)}
                disabled={!item.can_optimize || optimizeLoading || item.status === "pending" || item.status === "running"}
                className="border border-[#ddd] text-[#444] text-[13px] px-3 py-2 rounded-lg hover:border-[#bbb] disabled:opacity-40"
              >
                {optimizeLoading ? "Optimizing..." : item.has_export ? "Re-Optimize" : "Optimize"}
              </button>
              {(item.has_source_html || item.has_export) && (
                <button
                  type="button"
                  onClick={() => onOpenEditor(item.id)}
                  className="border border-[#ddd] text-[#444] text-[13px] px-3 py-2 rounded-lg hover:border-[#bbb]"
                >
                  Open Manually
                </button>
              )}
              {item.has_source_html && (
                <a
                  href={getSourceExportUrl(item.id)}
                  download
                  className="border border-[#ddd] text-[#444] text-[13px] px-3 py-2 rounded-lg hover:border-[#bbb]"
                >
                  Download Source
                </a>
              )}
              {item.has_export && (
                <a
                  href={getExportUrl(item.id)}
                  download
                  className="border border-[#ddd] text-[#444] text-[13px] px-3 py-2 rounded-lg hover:border-[#bbb]"
                >
                  Export HTML
                </a>
              )}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-4">
            <div className="border border-[#ececec] rounded-lg p-3">
              <p className="text-[11px] text-[#aaa] uppercase tracking-wider">Input</p>
              <p className="text-[13px] text-[#333] mt-2">Keyword: {item.keyword || "-"}</p>
              <p className="text-[13px] text-[#333]">Goal: {item.goal || "-"}</p>
              <p className="text-[13px] text-[#333]">Competitors: {item.num_competitors ?? "-"}</p>
            </div>
            <div className="border border-[#ececec] rounded-lg p-3">
              <p className="text-[11px] text-[#aaa] uppercase tracking-wider">Timing</p>
              <p className="text-[13px] text-[#333] mt-2">Created: {new Date(item.created_at).toLocaleString()}</p>
              <p className="text-[13px] text-[#333]">
                Finished: {item.finished_at ? new Date(item.finished_at).toLocaleString() : "-"}
              </p>
            </div>
          </section>

          {item.error_message && (
            <section className="border border-red-200 bg-red-50 rounded-lg p-3">
              <p className="text-[11px] text-red-700 uppercase tracking-wider">Latest Error</p>
              <p className="text-[13px] text-red-700 mt-2">
                {item.error_stage || "pipeline"} ({item.error_code || "unknown"}): {item.error_message}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
