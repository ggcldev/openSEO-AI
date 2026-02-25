"use client";

import { useState } from "react";
import type { HistoryItem, AuditResult } from "@/types";
import { getExportUrl } from "@/lib/apiClient";

interface Props { items: HistoryItem[]; onRefresh: () => void; }

const statusColor: Record<string, string> = {
  pending: "text-[#aaa]", running: "text-[#1a1a1a]", done: "text-[#888]", failed: "text-red-500",
};

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-[#aaa] uppercase tracking-wider mb-2">{children}</p>;
}

function PackDetails({ audit, hasExport, jobId }: { audit: AuditResult; hasExport: boolean; jobId: number }) {
  if (audit.parse_error) {
    return <pre className="text-[12px] text-[#888] whitespace-pre-wrap font-mono">{audit.raw_output}</pre>;
  }

  return (
    <div className="space-y-8">
      {/* Top bar */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-8">
          <div>
            <Label>Score</Label>
            <p className="text-[26px] font-semibold text-[#1a1a1a] leading-none">{audit.overall_score}</p>
          </div>
          {audit.priority_action && (
            <div>
              <Label>Action</Label>
              <p className="text-[14px] text-[#444] capitalize">{audit.priority_action.replace(/_/g, " ")}</p>
            </div>
          )}
          {audit.effort_level && (
            <div>
              <Label>Effort</Label>
              <p className="text-[14px] text-[#444] capitalize">{audit.effort_level}</p>
            </div>
          )}
        </div>
        {hasExport && (
          <a href={getExportUrl(jobId)} download onClick={(e) => e.stopPropagation()}
            className="border border-[#ddd] text-[#444] text-[13px] px-4 py-2 rounded-lg hover:text-[#1a1a1a] hover:border-[#bbb] transition-colors inline-flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download HTML
          </a>
        )}
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
            {audit.checklist.sort((a, b) => a.priority - b.priority).map((item, i) => (
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

export function TableResults({ items, onRefresh }: Props) {
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
              <>
                <tr key={item.id}
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="border-b border-[#f0f0f0] hover:bg-[#f8f8f8] cursor-pointer transition-colors">
                  <td className="px-4 py-3 text-[13px] text-[#1a1a1a] truncate max-w-[240px]">{item.url}</td>
                  <td className="px-4 py-3 text-[13px] text-[#888] capitalize">{item.page_type_input || "\u2014"}</td>
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
                      <PackDetails audit={audit} hasExport={item.has_export} jobId={item.id} />
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
