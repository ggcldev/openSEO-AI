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

function AuditDetails({ audit, hasExport, jobId, intent, pageType }: { audit: AuditResult; hasExport: boolean; jobId: number; intent?: string | null; pageType?: string | null }) {
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-[11px] text-[#777] uppercase tracking-wider mb-1">Score</p>
            <p className="text-[28px] font-semibold tracking-tight text-white leading-none">{audit.overall_score}</p>
          </div>
          {intent && (
            <div>
              <p className="text-[11px] text-[#777] uppercase tracking-wider mb-1">Intent</p>
              <p className="text-[13px] text-white">{intent}</p>
            </div>
          )}
          {pageType && (
            <div>
              <p className="text-[11px] text-[#777] uppercase tracking-wider mb-1">Page Type</p>
              <p className="text-[13px] text-white">{pageType.replace(/_/g, " ")}</p>
            </div>
          )}
        </div>
        {hasExport && (
          <a
            href={getExportUrl(jobId)}
            download
            onClick={(e) => e.stopPropagation()}
            className="border border-[#3a3a3a] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#222] transition-colors duration-200 inline-flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download HTML
          </a>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-[#2a2a2a] rounded-lg overflow-hidden">
        {audit.title_tag && (
          <div className="bg-[#161616] p-4">
            <p className="text-[11px] text-[#777] uppercase tracking-wider mb-2">Title Tag</p>
            <p className="text-[12px] text-white mb-1 truncate">{audit.title_tag.current}</p>
            <p className="text-[12px] text-[#999] leading-relaxed">{audit.title_tag.recommendation}</p>
          </div>
        )}
        {audit.meta_description && (
          <div className="bg-[#161616] p-4">
            <p className="text-[11px] text-[#777] uppercase tracking-wider mb-2">Meta Description</p>
            <p className="text-[12px] text-[#999] leading-relaxed">{audit.meta_description.recommendation}</p>
          </div>
        )}
        {audit.word_count && (
          <div className="bg-[#161616] p-4">
            <p className="text-[11px] text-[#777] uppercase tracking-wider mb-2">Word Count</p>
            <p className="text-[13px] text-white tabular-nums">{audit.word_count.yours} <span className="text-[#777]">/</span> {audit.word_count.serp_avg} avg</p>
            <p className="text-[12px] text-[#999] leading-relaxed">{audit.word_count.recommendation}</p>
          </div>
        )}
        {audit.keyword_usage && (
          <div className="bg-[#161616] p-4">
            <p className="text-[11px] text-[#777] uppercase tracking-wider mb-2">Keyword Density</p>
            <p className="text-[13px] text-white tabular-nums">{audit.keyword_usage.density_yours}% <span className="text-[#777]">/</span> {audit.keyword_usage.density_serp_avg}% avg</p>
            <p className="text-[12px] text-[#999] leading-relaxed">{audit.keyword_usage.recommendation}</p>
          </div>
        )}
        {audit.headings && (
          <div className="bg-[#161616] p-4">
            <p className="text-[11px] text-[#777] uppercase tracking-wider mb-2">Headings</p>
            <p className="text-[13px] text-white tabular-nums">H1: {audit.headings.h1_count} &middot; H2: {audit.headings.h2_count}</p>
            <p className="text-[12px] text-[#999] leading-relaxed">{audit.headings.recommendation}</p>
          </div>
        )}
      </div>

      {/* Strengths & Gaps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {audit.strengths?.length > 0 && (
          <div>
            <p className="text-[11px] text-[#777] uppercase tracking-wider mb-3">Strengths</p>
            <ul className="space-y-2">
              {audit.strengths.map((s, i) => (
                <li key={i} className="text-[13px] text-[#ccc] leading-relaxed">{s}</li>
              ))}
            </ul>
          </div>
        )}
        {audit.content_gaps?.length > 0 && (
          <div>
            <p className="text-[11px] text-[#777] uppercase tracking-wider mb-3">Content Gaps</p>
            <ul className="space-y-2">
              {audit.content_gaps.map((g, i) => (
                <li key={i} className="text-[13px] text-[#ccc] leading-relaxed">{g}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Recommendations */}
      {audit.recommendations?.length > 0 && (
        <div>
          <p className="text-[11px] text-[#777] uppercase tracking-wider mb-3">Recommendations</p>
          <div className="space-y-3">
            {audit.recommendations
              .sort((a, b) => a.priority - b.priority)
              .map((rec, i) => (
                <div key={i} className="border-l border-[#3a3a3a] pl-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12px] text-[#777] tabular-nums">{rec.priority}.</span>
                    <span className="text-[11px] text-[#777] uppercase tracking-wider">{rec.type}</span>
                  </div>
                  <p className="text-[13px] text-white leading-relaxed">{rec.action}</p>
                  <p className="text-[12px] text-[#999] mt-0.5">{rec.rationale}</p>
                </div>
              ))}
          </div>
        </div>
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
            <th className="text-left px-5 py-3 text-[11px] text-[#777] font-medium uppercase tracking-wider">Keyword</th>
            <th className="text-left px-5 py-3 text-[11px] text-[#777] font-medium uppercase tracking-wider">Score</th>
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
                <tr
                  key={item.id}
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="border-b border-[#1e1e1e] hover:bg-[#1a1a1a] cursor-pointer transition-colors duration-150"
                >
                  <td className="px-5 py-3.5 text-[13px] text-white truncate max-w-[220px]">{item.url}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#999]">{item.keyword || "\u2014"}</td>
                  <td className="px-5 py-3.5 text-[13px] font-medium text-white tabular-nums">
                    {audit && !audit.parse_error && audit.overall_score !== undefined ? audit.overall_score : "\u2014"}
                  </td>
                  <td className={`px-5 py-3.5 text-[13px] ${status.color}`}>{status.text}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#777] tabular-nums">
                    {new Date(item.created_at).toLocaleDateString()}
                  </td>
                </tr>
                {expandedId === item.id && audit && (
                  <tr key={`${item.id}-details`}>
                    <td colSpan={5} className="px-5 py-6 bg-[#161616] border-b border-[#1e1e1e]">
                      <AuditDetails audit={audit} hasExport={item.has_export} jobId={item.id} intent={item.detected_intent} pageType={item.page_type} />
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
