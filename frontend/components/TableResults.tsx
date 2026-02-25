"use client";

import { useState } from "react";
import type { HistoryItem, AuditResult } from "@/types";
import { getExportUrl } from "@/lib/apiClient";

interface TableResultsProps {
  items: HistoryItem[];
  onRefresh: () => void;
}

const statusLabel: Record<string, { text: string; color: string }> = {
  pending: { text: "Pending", color: "text-[#aaa]" },
  running: { text: "Running", color: "text-white" },
  done: { text: "Done", color: "text-[#aaa]" },
  failed: { text: "Failed", color: "text-red-400" },
};

const priorityColors: Record<string, string> = {
  optimize_now: "bg-white/10 text-white border-white/20",
  optimize_later: "bg-[#2a2a2a] text-[#aaa] border-[#333]",
  no_change: "bg-[#1a1a1a] text-[#777] border-[#2a2a2a]",
};

function PriorityBadge({ action, effort }: { action?: string; effort?: string }) {
  if (!action) return null;
  const label = action.replace(/_/g, " ");
  const color = priorityColors[action] || priorityColors.no_change;
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block px-2.5 py-1 rounded border text-[12px] font-medium capitalize ${color}`}>
        {label}
      </span>
      {effort && <span className="text-[11px] text-[#777] uppercase">{effort} effort</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-[#777] uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}

function AuditDetails({ audit, hasExport, jobId }: { audit: AuditResult; hasExport: boolean; jobId: number }) {
  if (audit.parse_error) {
    return (
      <div>
        <p className="text-[13px] text-[#aaa] mb-3">Could not parse AI output.</p>
        <pre className="text-[12px] text-[#777] whitespace-pre-wrap font-mono">{audit.raw_output}</pre>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header: Score + Priority + Export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-[11px] text-[#777] uppercase tracking-wider mb-1">Score</p>
            <p className="text-[28px] font-semibold tracking-tight text-white leading-none">{audit.overall_score}</p>
          </div>
          <PriorityBadge action={audit.priority_action} effort={audit.effort_level} />
        </div>
        {hasExport && (
          <a href={getExportUrl(jobId)} download onClick={(e) => e.stopPropagation()}
            className="border border-[#3a3a3a] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#222] transition-colors duration-200 inline-flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download HTML
          </a>
        )}
      </div>

      {/* Keywords */}
      {audit.keywords && (
        <Section title="Keywords">
          <div className="flex flex-wrap gap-2">
            <span className="bg-white/10 text-white text-[12px] px-2.5 py-1 rounded border border-white/20">
              {audit.keywords.primary}
            </span>
            {audit.keywords.secondary?.map((kw, i) => (
              <span key={i} className="bg-[#1a1a1a] text-[#ccc] text-[12px] px-2.5 py-1 rounded border border-[#2a2a2a]">
                {kw}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Title Options */}
      {audit.title_tag?.options && (
        <Section title="Title Tag Options">
          <p className="text-[12px] text-[#777] mb-2">Current: <span className="text-[#aaa]">{audit.title_tag.current}</span></p>
          <div className="space-y-1.5">
            {audit.title_tag.options.map((opt, i) => (
              <p key={i} className="text-[13px] text-white bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-2">{opt}</p>
            ))}
          </div>
        </Section>
      )}

      {/* Meta Description Options */}
      {audit.meta_description?.options && (
        <Section title="Meta Description Options">
          <div className="space-y-1.5">
            {audit.meta_description.options.map((opt, i) => (
              <p key={i} className="text-[12px] text-[#ccc] bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-2 leading-relaxed">{opt}</p>
            ))}
          </div>
        </Section>
      )}

      {/* Headings Plan */}
      {audit.headings_plan && (
        <Section title="Headings Plan">
          <p className="text-[13px] text-white mb-3">
            H1: {audit.headings_plan.recommended_h1}
          </p>
          <div className="space-y-1">
            {audit.headings_plan.outline?.map((h, i) => (
              <div key={i} className={`flex items-start gap-3 text-[12px] py-1.5 ${h.tag === "h3" ? "pl-4" : ""}`}>
                <span className="text-[#555] uppercase w-6 shrink-0">{h.tag}</span>
                <span className="text-white flex-1">{h.text}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                  h.status === "add" ? "text-white bg-white/10" :
                  h.status === "rewrite" ? "text-[#aaa] bg-[#2a2a2a]" :
                  "text-[#777] bg-[#1a1a1a]"
                }`}>{h.status}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* FAQ Pack */}
      {audit.faq_pack && audit.faq_pack.length > 0 && (
        <Section title={`FAQ Pack (${audit.faq_pack.length})`}>
          <div className="space-y-3">
            {audit.faq_pack.map((faq, i) => (
              <div key={i} className="border-l border-[#3a3a3a] pl-4">
                <p className="text-[13px] text-white mb-1">{faq.question}</p>
                <p className="text-[12px] text-[#999] leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Word Count */}
      {audit.word_count && (
        <Section title="Word Count">
          <p className="text-[13px] text-white tabular-nums">
            Yours: {audit.word_count.yours} <span className="text-[#777]">/</span> Avg: {audit.word_count.serp_avg} <span className="text-[#777]">/</span> Top: {audit.word_count.serp_top}
          </p>
          <p className="text-[12px] text-[#999] mt-1">{audit.word_count.recommendation}</p>
        </Section>
      )}

      {/* Strengths & Gaps side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {audit.strengths && audit.strengths.length > 0 && (
          <Section title="Strengths">
            <ul className="space-y-1.5">
              {audit.strengths.map((s, i) => (
                <li key={i} className="text-[13px] text-[#ccc] leading-relaxed">{s}</li>
              ))}
            </ul>
          </Section>
        )}
        {audit.content_gaps && audit.content_gaps.length > 0 && (
          <Section title="Content Gaps">
            <ul className="space-y-1.5">
              {audit.content_gaps.map((g, i) => (
                <li key={i} className="text-[13px] text-[#ccc] leading-relaxed">{g}</li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {/* Change Summary */}
      {audit.change_summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {audit.change_summary.keep?.length > 0 && (
            <Section title="Keep As-Is">
              <ul className="space-y-1.5">
                {audit.change_summary.keep.map((k, i) => (
                  <li key={i} className="text-[12px] text-[#999]">{k}</li>
                ))}
              </ul>
            </Section>
          )}
          {audit.change_summary.change?.length > 0 && (
            <Section title="Change">
              <ul className="space-y-1.5">
                {audit.change_summary.change.map((c, i) => (
                  <li key={i} className="text-[12px] text-[#ccc]">{c}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {/* Checklist */}
      {audit.checklist && audit.checklist.length > 0 && (
        <Section title="Implementation Checklist">
          <div className="space-y-2">
            {audit.checklist
              .sort((a, b) => a.priority - b.priority)
              .map((item, i) => (
                <div key={i} className="flex items-start gap-3 bg-[#161616] rounded-lg px-4 py-3 border border-[#222]">
                  <span className="text-[12px] text-[#777] tabular-nums shrink-0">{item.priority}.</span>
                  <div className="flex-1">
                    <p className="text-[13px] text-white">{item.task}</p>
                    <p className="text-[11px] text-[#777] mt-0.5">{item.location}</p>
                  </div>
                </div>
              ))}
          </div>
        </Section>
      )}
    </div>
  );
}

export function TableResults({ items, onRefresh }: TableResultsProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <div className="border border-[#2a2a2a] rounded-xl p-12 text-center">
        <p className="text-[14px] text-[#777]">No jobs yet</p>
      </div>
    );
  }

  return (
    <div className="border border-[#2a2a2a] rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#2a2a2a]">
            <th className="text-left px-5 py-3 text-[11px] text-[#777] font-medium uppercase tracking-wider">URL</th>
            <th className="text-left px-5 py-3 text-[11px] text-[#777] font-medium uppercase tracking-wider">Type</th>
            <th className="text-left px-5 py-3 text-[11px] text-[#777] font-medium uppercase tracking-wider">Score</th>
            <th className="text-left px-5 py-3 text-[11px] text-[#777] font-medium uppercase tracking-wider">Action</th>
            <th className="text-left px-5 py-3 text-[11px] text-[#777] font-medium uppercase tracking-wider">Status</th>
            <th className="text-left px-5 py-3 text-[11px] text-[#777] font-medium uppercase tracking-wider">Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            let audit: AuditResult | null = null;
            if (item.audit_result) {
              try { audit = JSON.parse(item.audit_result); } catch {}
            }
            const status = statusLabel[item.status] || { text: item.status, color: "text-[#777]" };

            return (
              <>
                <tr key={item.id}
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="border-b border-[#1e1e1e] hover:bg-[#1a1a1a] cursor-pointer transition-colors duration-150">
                  <td className="px-5 py-3.5 text-[13px] text-white truncate max-w-[220px]">{item.url}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#999] capitalize">{item.page_type_input || "\u2014"}</td>
                  <td className="px-5 py-3.5 text-[13px] font-medium text-white tabular-nums">
                    {audit && !audit.parse_error && audit.overall_score !== undefined ? audit.overall_score : "\u2014"}
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-[#aaa] capitalize">
                    {audit?.priority_action?.replace(/_/g, " ") || "\u2014"}
                  </td>
                  <td className={`px-5 py-3.5 text-[13px] ${status.color}`}>{status.text}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#777] tabular-nums">
                    {new Date(item.created_at).toLocaleDateString()}
                  </td>
                </tr>
                {expandedId === item.id && audit && (
                  <tr key={`${item.id}-details`}>
                    <td colSpan={6} className="px-5 py-6 bg-[#161616] border-b border-[#1e1e1e]">
                      <AuditDetails audit={audit} hasExport={item.has_export} jobId={item.id} />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
