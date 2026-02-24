"use client";

import { useState } from "react";
import type { HistoryItem, AuditResult } from "@/types";
import { getExportUrl } from "@/lib/apiClient";

interface TableResultsProps {
  items: HistoryItem[];
  onRefresh: () => void;
}

const statusColors: Record<string, string> = {
  pending: "text-yellow-400",
  running: "text-blue-400",
  done: "text-green-400",
  failed: "text-red-400",
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-green-500/20 text-green-400 border-green-500/30" :
    score >= 40 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
    "bg-red-500/20 text-red-400 border-red-500/30";

  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${color}`}>
      {score}/100
    </span>
  );
}

function AuditDetails({ audit, hasExport, jobId }: { audit: AuditResult; hasExport: boolean; jobId: number }) {
  if (audit.parse_error) {
    return (
      <div className="text-sm">
        <p className="text-yellow-400 mb-2">AI output could not be parsed. Raw output:</p>
        <pre className="text-xs text-gray-400 whitespace-pre-wrap">{audit.raw_output}</pre>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      {/* Score + Export */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-gray-400">Overall Score:</span>
          <ScoreBadge score={audit.overall_score} />
        </div>
        {hasExport && (
          <a
            href={getExportUrl(jobId)}
            download
            onClick={(e) => e.stopPropagation()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition inline-flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download HTML
          </a>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {audit.title_tag && (
          <div className="bg-gray-800/50 rounded p-3">
            <div className="text-gray-400 text-xs mb-1">Title Tag</div>
            <div className="text-white text-xs mb-1 truncate">{audit.title_tag.current}</div>
            <div className={`text-xs ${audit.title_tag.status === "ok" ? "text-green-400" : "text-yellow-400"}`}>
              {audit.title_tag.recommendation}
            </div>
          </div>
        )}
        {audit.meta_description && (
          <div className="bg-gray-800/50 rounded p-3">
            <div className="text-gray-400 text-xs mb-1">Meta Description</div>
            <div className={`text-xs ${audit.meta_description.status === "ok" ? "text-green-400" : "text-yellow-400"}`}>
              {audit.meta_description.recommendation}
            </div>
          </div>
        )}
        {audit.word_count && (
          <div className="bg-gray-800/50 rounded p-3">
            <div className="text-gray-400 text-xs mb-1">Word Count</div>
            <div className="text-white text-xs">
              Yours: {audit.word_count.yours} | Avg: {audit.word_count.serp_avg} | Top: {audit.word_count.serp_top}
            </div>
            <div className={`text-xs ${audit.word_count.status === "ok" ? "text-green-400" : "text-red-400"}`}>
              {audit.word_count.recommendation}
            </div>
          </div>
        )}
        {audit.keyword_usage && (
          <div className="bg-gray-800/50 rounded p-3">
            <div className="text-gray-400 text-xs mb-1">Keyword Density</div>
            <div className="text-white text-xs">
              Yours: {audit.keyword_usage.density_yours}% | SERP Avg: {audit.keyword_usage.density_serp_avg}%
            </div>
            <div className={`text-xs ${audit.keyword_usage.status === "ok" ? "text-green-400" : "text-yellow-400"}`}>
              {audit.keyword_usage.recommendation}
            </div>
          </div>
        )}
        {audit.headings && (
          <div className="bg-gray-800/50 rounded p-3">
            <div className="text-gray-400 text-xs mb-1">Headings</div>
            <div className="text-white text-xs">H1: {audit.headings.h1_count} | H2: {audit.headings.h2_count}</div>
            <div className={`text-xs ${audit.headings.status === "ok" ? "text-green-400" : "text-yellow-400"}`}>
              {audit.headings.recommendation}
            </div>
          </div>
        )}
      </div>

      {/* Strengths */}
      {audit.strengths?.length > 0 && (
        <div>
          <h4 className="text-green-400 font-medium mb-1">Strengths</h4>
          <ul className="list-disc list-inside text-gray-300 text-xs space-y-1">
            {audit.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {/* Content Gaps */}
      {audit.content_gaps?.length > 0 && (
        <div>
          <h4 className="text-yellow-400 font-medium mb-1">Content Gaps</h4>
          <ul className="list-disc list-inside text-gray-300 text-xs space-y-1">
            {audit.content_gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {audit.recommendations?.length > 0 && (
        <div>
          <h4 className="text-blue-400 font-medium mb-2">Recommendations</h4>
          <div className="space-y-2">
            {audit.recommendations
              .sort((a, b) => a.priority - b.priority)
              .map((rec, i) => (
                <div key={i} className="bg-gray-800/30 rounded p-3 border-l-2 border-blue-500/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-blue-400 text-xs font-bold">#{rec.priority}</span>
                    <span className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded text-xs">
                      {rec.type}
                    </span>
                  </div>
                  <p className="text-white text-xs">{rec.action}</p>
                  <p className="text-gray-500 text-xs mt-1">{rec.rationale}</p>
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
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-500">
        No optimization jobs yet. Enter a URL above to get started.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400">
            <th className="text-left px-4 py-3 font-medium">ID</th>
            <th className="text-left px-4 py-3 font-medium">URL</th>
            <th className="text-left px-4 py-3 font-medium">Keyword</th>
            <th className="text-left px-4 py-3 font-medium">Score</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="text-left px-4 py-3 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            let audit: AuditResult | null = null;
            if (item.audit_result) {
              try {
                audit = JSON.parse(item.audit_result);
              } catch {}
            }

            return (
              <>
                <tr
                  key={item.id}
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer transition"
                >
                  <td className="px-4 py-3 text-gray-300">#{item.id}</td>
                  <td className="px-4 py-3 text-white truncate max-w-[200px]">{item.url}</td>
                  <td className="px-4 py-3 text-gray-300">{item.keyword || "-"}</td>
                  <td className="px-4 py-3">
                    {audit && !audit.parse_error && audit.overall_score !== undefined ? (
                      <ScoreBadge score={audit.overall_score} />
                    ) : item.status === "done" ? (
                      <span className="text-gray-500 text-xs">-</span>
                    ) : null}
                  </td>
                  <td className={`px-4 py-3 font-medium ${statusColors[item.status] || "text-gray-400"}`}>
                    {item.status === "running" ? "running..." : item.status}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                </tr>
                {expandedId === item.id && audit && (
                  <tr key={`${item.id}-details`}>
                    <td colSpan={6} className="px-6 py-4 bg-gray-800/20">
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
