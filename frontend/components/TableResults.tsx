"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { HistoryItem, AuditResult } from "@/types";
import { getExportUrl, getSourceExportUrl } from "@/lib/apiClient";

interface Props {
  items: HistoryItem[];
  onOpenEditor: (jobId: number) => void;
  onOpenDetails: (jobId: number) => void;
  onOptimizeJob: (jobId: number) => void;
  optimizingJobId: number | null;
}

const statusColor: Record<string, string> = {
  pending: "text-[#aaa]", running: "text-[#1a1a1a]", done: "text-[#888]", failed: "text-red-500",
};

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-[#aaa] uppercase tracking-wider mb-2">{children}</p>;
}

function PackDetails({
  audit,
  jobId,
  item,
  onOpenEditor,
  onOpenDetails,
  onOptimizeJob,
  optimizingJobId,
}: {
  audit: AuditResult;
  jobId: number;
  item: HistoryItem;
  onOpenEditor: (jobId: number) => void;
  onOpenDetails: (jobId: number) => void;
  onOptimizeJob: (jobId: number) => void;
  optimizingJobId: number | null;
}) {
  const [showMoreActions, setShowMoreActions] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement | null>(null);
  const isBusy = item.status === "pending" || item.status === "running";
  const isOptimizing = optimizingJobId === jobId;
  const canOpenEditor = item.has_source_html || item.has_export;
  const canOptimize = item.can_optimize;

  const primaryAction = canOpenEditor ? "open_editor" : canOptimize ? "optimize" : "view_details";
  const primaryLabel =
    primaryAction === "open_editor"
      ? "Open Editor"
      : primaryAction === "optimize"
        ? isOptimizing
          ? "Optimizing..."
          : item.has_export
            ? "Refresh Optimization"
            : "Optimize Page"
        : "View Details";
  const primaryDisabled = primaryAction === "optimize" ? isBusy || isOptimizing : false;

  useEffect(() => {
    if (!showMoreActions) return;

    function onPointerDown(event: MouseEvent) {
      if (!moreActionsRef.current) return;
      if (moreActionsRef.current.contains(event.target as Node)) return;
      setShowMoreActions(false);
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowMoreActions(false);
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [showMoreActions]);

  function runPrimaryAction(event: React.MouseEvent) {
    event.stopPropagation();
    if (primaryAction === "open_editor") {
      onOpenEditor(jobId);
      return;
    }
    if (primaryAction === "optimize") {
      onOptimizeJob(jobId);
      return;
    }
    onOpenDetails(jobId);
  }

  if (audit.parse_error) {
    return (
      <div className="space-y-4">
        <p className="text-[13px] text-[#666]">
          Audit insights are not available for this run. You can still open the editor or view job details.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runPrimaryAction}
            disabled={primaryDisabled}
            className="bg-[#1a1a1a] text-white text-[13px] px-4 py-2 rounded-lg hover:bg-[#333] disabled:opacity-40"
          >
            {primaryLabel}
          </button>
          <div ref={moreActionsRef} className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMoreActions((v) => !v);
              }}
              className="border border-[#ddd] text-[#444] text-[13px] px-3 py-2 rounded-lg hover:border-[#bbb]"
            >
              Actions
            </button>
            {showMoreActions && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-10 min-w-[170px] rounded-lg border border-[#e6e6e6] bg-white shadow-lg p-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMoreActions(false);
                    onOpenDetails(jobId);
                  }}
                  className="w-full text-left text-[12px] px-2.5 py-2 rounded hover:bg-[#f5f5f5]"
                >
                  View Details
                </button>
                {item.has_source_html && (
                  <a
                    href={getSourceExportUrl(jobId)}
                    download
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMoreActions(false);
                    }}
                    className="block text-[12px] px-2.5 py-2 rounded hover:bg-[#f5f5f5] text-[#333]"
                  >
                    Download Source
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {item.status === "failed" && item.error_message && (
        <div className="border border-red-200 bg-red-50 rounded-lg px-4 py-3">
          <p className="text-[12px] text-red-700">
            Failed at {item.error_stage || "pipeline"} ({item.error_code || "unknown"}): {item.error_message}
          </p>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-8">
          <div>
            <Label>Score</Label>
            <p className="text-[26px] font-semibold text-[#1a1a1a] leading-none">{audit.overall_score}</p>
          </div>
          {item.page_type && (
            <div>
              <Label>Page Type</Label>
              <p className="text-[14px] text-[#444] capitalize">
                {item.page_type}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runPrimaryAction}
            disabled={primaryDisabled}
            className="bg-[#1a1a1a] text-white text-[13px] px-4 py-2 rounded-lg hover:bg-[#333] disabled:opacity-40"
          >
            {primaryLabel}
          </button>

          <div ref={moreActionsRef} className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMoreActions((v) => !v);
              }}
              className="border border-[#ddd] text-[#444] text-[13px] px-3 py-2 rounded-lg hover:border-[#bbb]"
            >
              Actions
            </button>
            {showMoreActions && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-10 min-w-[190px] rounded-lg border border-[#e6e6e6] bg-white shadow-lg p-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMoreActions(false);
                    onOpenDetails(jobId);
                  }}
                  className="w-full text-left text-[12px] px-2.5 py-2 rounded hover:bg-[#f5f5f5]"
                >
                  View Details
                </button>
                {canOptimize && primaryAction !== "optimize" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMoreActions(false);
                      onOptimizeJob(jobId);
                    }}
                    disabled={isBusy || isOptimizing}
                    className="w-full text-left text-[12px] px-2.5 py-2 rounded hover:bg-[#f5f5f5] disabled:opacity-40"
                  >
                    {isOptimizing ? "Optimizing..." : item.has_export ? "Refresh Optimization" : "Optimize Page"}
                  </button>
                )}
                {item.has_source_html && (
                  <a
                    href={getSourceExportUrl(jobId)}
                    download
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMoreActions(false);
                    }}
                    className="block text-[12px] px-2.5 py-2 rounded hover:bg-[#f5f5f5] text-[#333]"
                  >
                    Download Source
                  </a>
                )}
                {item.has_export && (
                  <a
                    href={getExportUrl(jobId)}
                    download
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMoreActions(false);
                    }}
                    className="block text-[12px] px-2.5 py-2 rounded hover:bg-[#f5f5f5] text-[#333]"
                  >
                    Export HTML
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Keywords */}
      {audit.keywords && (
        <div>
          <Label>Keywords</Label>
          <div className="flex flex-wrap gap-2">
            <span className="text-[12px] text-[#1a1a1a] bg-[#eee] px-2.5 py-1 rounded font-medium">{audit.keywords.primary}</span>
            {audit.keywords.secondary?.map((kw, i) => (
              <span key={i} className="text-[12px] text-[#666] bg-[#f3f3f3] px-2.5 py-1 rounded">{kw}</span>
            ))}
          </div>
        </div>
      )}

      {/* Title options */}
      {audit.title_tag?.options && (
        <div>
          <Label>Title Options</Label>
          <p className="text-[11px] text-[#aaa] mb-2">Current: {audit.title_tag.current}</p>
          {audit.title_tag.options.map((t, i) => (
            <p key={i} className="text-[13px] text-[#333] py-1.5">{i + 1}. {t}</p>
          ))}
        </div>
      )}

      {/* Meta options */}
      {audit.meta_description?.options && (
        <div>
          <Label>Meta Description Options</Label>
          {audit.meta_description.options.map((m, i) => (
            <p key={i} className="text-[12px] text-[#555] py-1.5 leading-relaxed">{i + 1}. {m}</p>
          ))}
        </div>
      )}

      {/* Headings plan */}
      {audit.headings_plan && (
        <div>
          <Label>Headings Plan</Label>
          <p className="text-[13px] text-[#1a1a1a] font-medium mb-3">H1: {audit.headings_plan.recommended_h1}</p>
          {audit.headings_plan.outline?.map((h, i) => (
            <div key={i} className={`flex items-center gap-3 py-1 text-[12px] ${h.tag === "h3" ? "pl-5" : ""}`}>
              <span className="text-[#bbb] w-5 uppercase shrink-0">{h.tag}</span>
              <span className="text-[#444] flex-1">{h.text}</span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                h.status === "add" ? "text-[#1a1a1a] bg-[#eee]" : "text-[#aaa]"
              }`}>{h.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* FAQ */}
      {audit.faq_pack && audit.faq_pack.length > 0 && (
        <div>
          <Label>FAQ Pack ({audit.faq_pack.length})</Label>
          <div className="space-y-4">
            {audit.faq_pack.map((f, i) => (
              <div key={i}>
                <p className="text-[13px] text-[#1a1a1a] mb-1">{f.question}</p>
                <p className="text-[12px] text-[#777] leading-relaxed">{f.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Word count */}
      {audit.word_count && (
        <div>
          <Label>Word Count</Label>
          <p className="text-[13px] text-[#1a1a1a] tabular-nums">
            {audit.word_count.yours} yours &middot; {audit.word_count.serp_avg} avg &middot; {audit.word_count.serp_top} top
          </p>
          <p className="text-[12px] text-[#888] mt-1">{audit.word_count.recommendation}</p>
        </div>
      )}

      {/* Strengths + Gaps */}
      {(audit.strengths?.length || audit.content_gaps?.length) && (
        <div className="grid grid-cols-2 gap-8">
          {audit.strengths && audit.strengths.length > 0 && (
            <div>
              <Label>Strengths</Label>
              {audit.strengths.map((s, i) => <p key={i} className="text-[12px] text-[#555] py-0.5">{s}</p>)}
            </div>
          )}
          {audit.content_gaps && audit.content_gaps.length > 0 && (
            <div>
              <Label>Content Gaps</Label>
              {audit.content_gaps.map((g, i) => <p key={i} className="text-[12px] text-[#555] py-0.5">{g}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Change summary */}
      {audit.change_summary && (
        <div className="grid grid-cols-2 gap-8">
          {audit.change_summary.keep?.length > 0 && (
            <div>
              <Label>Keep</Label>
              {audit.change_summary.keep.map((k, i) => <p key={i} className="text-[12px] text-[#888] py-0.5">{k}</p>)}
            </div>
          )}
          {audit.change_summary.change?.length > 0 && (
            <div>
              <Label>Change</Label>
              {audit.change_summary.change.map((c, i) => <p key={i} className="text-[12px] text-[#555] py-0.5">{c}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Checklist */}
      {audit.checklist && audit.checklist.length > 0 && (
        <div>
          <Label>Checklist</Label>
          <div className="space-y-2">
            {[...audit.checklist].sort((a, b) => a.priority - b.priority).map((item, i) => (
              <div key={i} className="flex gap-3 py-2">
                <span className="text-[12px] text-[#bbb] tabular-nums w-4 shrink-0">{item.priority}.</span>
                <div>
                  <p className="text-[13px] text-[#333]">{item.task}</p>
                  <p className="text-[11px] text-[#aaa]">{item.location}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TableResults({
  items,
  onOpenEditor,
  onOpenDetails,
  onOptimizeJob,
  optimizingJobId,
}: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (items.length === 0) {
    return <p className="text-[13px] text-[#bbb] py-8 text-center">No jobs yet</p>;
  }

  return (
    <div className="border border-[#e8e8e8] rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#e8e8e8] bg-[#f8f8f8]">
            <th className="text-left px-4 py-3 text-[11px] text-[#aaa] font-medium uppercase tracking-wider">URL</th>
            <th className="text-left px-4 py-3 text-[11px] text-[#aaa] font-medium uppercase tracking-wider">Type</th>
            <th className="text-left px-4 py-3 text-[11px] text-[#aaa] font-medium uppercase tracking-wider">Score</th>
            <th className="text-left px-4 py-3 text-[11px] text-[#aaa] font-medium uppercase tracking-wider">Status</th>
            <th className="text-left px-4 py-3 text-[11px] text-[#aaa] font-medium uppercase tracking-wider">Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            let audit: AuditResult | null = null;
            if (item.audit_result) { try { audit = JSON.parse(item.audit_result); } catch {} }

            return (
              <Fragment key={item.id}>
                <tr key={item.id}
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="border-b border-[#f0f0f0] hover:bg-[#f8f8f8] cursor-pointer transition-colors">
                  <td className="px-4 py-3 text-[13px] text-[#1a1a1a] truncate max-w-[240px]">{item.url}</td>
                  <td className="px-4 py-3 text-[13px] text-[#888] capitalize">{item.page_type || "\u2014"}</td>
                  <td className="px-4 py-3 text-[13px] text-[#1a1a1a] font-medium tabular-nums">
                    {audit && !audit.parse_error ? audit.overall_score : "\u2014"}
                  </td>
                  <td className={`px-4 py-3 text-[13px] ${statusColor[item.status] || "text-[#aaa]"}`}>
                    {item.status}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#aaa] tabular-nums">
                    {new Date(item.created_at).toLocaleDateString()}
                  </td>
                </tr>
                {expandedId === item.id && audit && (
                  <tr key={`${item.id}-pack`}>
                    <td colSpan={5} className="px-6 py-8 bg-[#f8f8f8] border-b border-[#f0f0f0]">
                      <PackDetails
                        audit={audit}
                        jobId={item.id}
                        item={item}
                        onOpenEditor={onOpenEditor}
                        onOpenDetails={onOpenDetails}
                        onOptimizeJob={onOptimizeJob}
                        optimizingJobId={optimizingJobId}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
