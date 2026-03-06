"use client";

import { TermFrequencyPanel } from "@/components/editor/TermFrequencyPanel";
import type { SideTab, SignalStatus, TermStatus, TermSignal, SeoSignal } from "@/components/editor/types";
import type { AuditResult } from "@/types";

interface RangeTarget {
  min: number;
  max: number;
}

interface SeoSignalsSidebarProps {
  jobId: number;
  sideTab: SideTab;
  liveScore: number;
  targetWords: number;
  autoOptimizing: boolean;
  hasDocument: boolean;
  scoreGauge: {
    circumference: number;
    offset: number;
  };
  stats: {
    wordCount: number;
    headingCount: number;
    paragraphCount: number;
    imageCount: number;
  };
  headingTarget: RangeTarget;
  paragraphTarget: RangeTarget;
  imageTarget: RangeTarget;
  termQuery: string;
  filteredTerms: TermSignal[];
  criticalSignals: SeoSignal[];
  seoSignals: SeoSignal[];
  audit: AuditResult | null;
  onAutoOptimize: () => void;
  onSideTabChange: (tab: SideTab) => void;
  onTermQueryChange: (value: string) => void;
}

function classifyRange(value: number, min: number, max: number): TermStatus {
  if (value < min) return "low";
  if (value > max) return "high";
  return "good";
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Strong";
  if (score >= 65) return "Good";
  if (score >= 45) return "Needs Work";
  return "Critical";
}

function statusTone(status: SignalStatus): { badge: string; text: string } {
  if (status === "pass") {
    return {
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
      text: "text-emerald-700",
    };
  }

  if (status === "warn") {
    return {
      badge: "bg-amber-50 text-amber-700 border-amber-200",
      text: "text-amber-700",
    };
  }

  return {
    badge: "bg-red-50 text-red-700 border-red-200",
    text: "text-red-700",
  };
}

function metricTone(status: TermStatus): string {
  if (status === "good") return "text-emerald-600";
  if (status === "high") return "text-amber-600";
  return "text-red-600";
}

export function SeoSignalsSidebar({
  jobId,
  sideTab,
  liveScore,
  targetWords,
  autoOptimizing,
  hasDocument,
  scoreGauge,
  stats,
  headingTarget,
  paragraphTarget,
  imageTarget,
  termQuery,
  filteredTerms,
  criticalSignals,
  seoSignals,
  audit,
  onAutoOptimize,
  onSideTabChange,
  onTermQueryChange,
}: SeoSignalsSidebarProps) {
  const structureCards = [
    {
      label: "Words",
      value: stats.wordCount,
      range: `${Math.round(targetWords * 0.85)}-${Math.round(targetWords * 1.2)}`,
      status: classifyRange(stats.wordCount, Math.round(targetWords * 0.85), Math.round(targetWords * 1.2)),
    },
    {
      label: "Headings",
      value: stats.headingCount,
      range: `${headingTarget.min}-${headingTarget.max}`,
      status: classifyRange(stats.headingCount, headingTarget.min, headingTarget.max),
    },
    {
      label: "Paragraphs",
      value: stats.paragraphCount,
      range: `${paragraphTarget.min}-${paragraphTarget.max}`,
      status: classifyRange(stats.paragraphCount, paragraphTarget.min, paragraphTarget.max),
    },
    {
      label: "Images",
      value: stats.imageCount,
      range: `${imageTarget.min}-${imageTarget.max}`,
      status: classifyRange(stats.imageCount, imageTarget.min, imageTarget.max),
    },
  ];

  return (
    <aside className="min-h-0 overflow-auto bg-[linear-gradient(180deg,#f8faff_0%,#f2f5ff_100%)]">
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 rounded-2xl bg-[#edf1fb] p-1.5">
          {(["guidelines", "facts", "outline"] as SideTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onSideTabChange(tab)}
              className={`h-9 rounded-xl text-[11px] uppercase tracking-wide font-semibold transition-colors ${
                sideTab === tab ? "bg-white text-[#3f2fa5] shadow-sm" : "text-[#7b7d90]"
              }`}
            >
              {tab === "guidelines" ? "Guidelines" : tab === "facts" ? "Facts" : "Outline"}
            </button>
          ))}
        </div>

        {sideTab === "guidelines" && (
          <>
            <section className="rounded-2xl border border-[#e4e8f3] bg-white/95 p-3.5 shadow-[0_1px_0_rgba(18,24,40,0.02)]">
              <p className="text-[12px] font-semibold text-[#2a2d43]">Content Score</p>
              <div className="relative mt-2">
                <svg viewBox="0 0 200 118" className="w-full h-32">
                  <defs>
                    <linearGradient id={`score-gradient-${jobId}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#eb5757" />
                      <stop offset="52%" stopColor="#f2c94c" />
                      <stop offset="100%" stopColor="#6fcf97" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 20 98 A 74 74 0 0 1 180 98"
                    fill="none"
                    stroke="#ececf2"
                    strokeWidth="14"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 20 98 A 74 74 0 0 1 180 98"
                    fill="none"
                    stroke={`url(#score-gradient-${jobId})`}
                    strokeWidth="14"
                    strokeLinecap="round"
                    strokeDasharray={`${scoreGauge.circumference} ${scoreGauge.circumference}`}
                    strokeDashoffset={scoreGauge.offset}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-3">
                  <p className="text-[42px] leading-none font-semibold text-[#222438]">{liveScore}</p>
                  <p className="text-[12px] text-[#7a7d91] mt-1">{scoreLabel(liveScore)}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[12px] text-[#6d7085]">
                <span>Audit {audit?.overall_score ?? "-"}</span>
                <span>Target {targetWords} words</span>
              </div>
              <button
                type="button"
                onClick={onAutoOptimize}
                disabled={autoOptimizing || !hasDocument}
                className="mt-3 w-full h-10 rounded-lg bg-[#151622] text-white text-[13px] font-semibold hover:bg-[#24263a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {autoOptimizing ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
                      <path
                        className="opacity-90"
                        d="M21 12a9 9 0 0 0-9-9"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span>Auto-Optimizing...</span>
                  </span>
                ) : (
                  "Auto-Optimize"
                )}
              </button>
            </section>

            <section className="rounded-2xl border border-[#e4e8f3] bg-white/95 p-3.5 shadow-[0_1px_0_rgba(18,24,40,0.02)]">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-[#2a2d43]">Content Structure</p>
                <span className="text-[11px] text-[#8a8da4]">Live</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {structureCards.map((item) => (
                  <div key={item.label} className="rounded-lg border border-[#eef0f6] bg-[#fcfcff] p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-[#8f92a8]">{item.label}</p>
                    <p className={`text-[20px] font-semibold leading-none mt-1 ${metricTone(item.status)}`}>
                      {item.value}
                    </p>
                    <p className="text-[11px] text-[#8d90a6] mt-1">{item.range}</p>
                  </div>
                ))}
              </div>
            </section>

            <TermFrequencyPanel
              termQuery={termQuery}
              filteredTerms={filteredTerms}
              onTermQueryChange={onTermQueryChange}
            />
          </>
        )}

        {sideTab === "facts" && (
          <>
            <section className="rounded-2xl border border-[#e4e8f3] bg-white/95 p-3.5 shadow-[0_1px_0_rgba(18,24,40,0.02)]">
              <p className="text-[12px] font-semibold text-[#2a2d43]">Priority Fixes</p>
              <div className="mt-2 space-y-2">
                {criticalSignals.length > 0 ? (
                  criticalSignals.map((signal) => (
                    <div key={signal.key} className="rounded-lg border border-[#ececf3] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12px] text-[#303248] font-medium">{signal.label}</p>
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${statusTone(signal.status).badge}`}
                        >
                          {signal.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#7a7d93] mt-1">{signal.recommendation}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[12px] text-[#8f91a6]">No critical issues detected.</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[#e4e8f3] bg-white/95 p-3.5 shadow-[0_1px_0_rgba(18,24,40,0.02)]">
              <p className="text-[12px] font-semibold text-[#2a2d43]">Strengths</p>
              <div className="mt-2 space-y-1.5">
                {(audit?.strengths || []).length > 0 ? (
                  (audit?.strengths || []).map((row, idx) => (
                    <p key={`${row}-${idx}`} className="text-[12px] text-[#5f6278]">
                      - {row}
                    </p>
                  ))
                ) : (
                  <p className="text-[12px] text-[#9295aa]">No strengths listed by audit.</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[#e4e8f3] bg-white/95 p-3.5 shadow-[0_1px_0_rgba(18,24,40,0.02)]">
              <p className="text-[12px] font-semibold text-[#2a2d43]">Content Gaps</p>
              <div className="mt-2 space-y-1.5">
                {(audit?.content_gaps || []).length > 0 ? (
                  (audit?.content_gaps || []).map((row, idx) => (
                    <p key={`${row}-${idx}`} className="text-[12px] text-[#5f6278]">
                      - {row}
                    </p>
                  ))
                ) : (
                  <p className="text-[12px] text-[#9295aa]">No content gaps listed by audit.</p>
                )}
              </div>
            </section>
          </>
        )}

        {sideTab === "outline" && (
          <>
            <section className="rounded-2xl border border-[#e4e8f3] bg-white/95 p-3.5 shadow-[0_1px_0_rgba(18,24,40,0.02)]">
              <p className="text-[12px] font-semibold text-[#2a2d43]">Recommended Outline</p>
              {audit?.headings_plan ? (
                <div className="mt-2 space-y-2">
                  <p className="text-[12px] text-[#3a3d54]">
                    H1: <span className="font-semibold">{audit.headings_plan.recommended_h1}</span>
                  </p>
                  {(audit.headings_plan.outline || []).map((row, idx) => (
                    <div key={`${row.tag}-${row.text}-${idx}`} className="flex items-start gap-2 text-[12px]">
                      <span className="mt-0.5 rounded bg-[#f1f2f8] px-1.5 py-0.5 text-[10px] uppercase text-[#6f7288]">
                        {row.tag}
                      </span>
                      <p className="text-[#4a4d63]">{row.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-[#9295aa]">No outline recommendation available.</p>
              )}
            </section>

            <section className="rounded-2xl border border-[#e4e8f3] bg-white/95 p-3.5 shadow-[0_1px_0_rgba(18,24,40,0.02)]">
              <p className="text-[12px] font-semibold text-[#2a2d43]">Checklist</p>
              {audit?.checklist && audit.checklist.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {audit.checklist
                    .slice()
                    .sort((a, b) => a.priority - b.priority)
                    .slice(0, 12)
                    .map((item, idx) => (
                      <div key={`${item.task}-${idx}`} className="rounded-md border border-[#ececf3] p-2">
                        <p className="text-[12px] text-[#3f4259]">
                          {item.priority}. {item.task}
                        </p>
                        <p className="text-[11px] text-[#8c90a6] mt-0.5">{item.location}</p>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-[#9295aa]">No checklist items available.</p>
              )}
            </section>

            <section className="rounded-2xl border border-[#e4e8f3] bg-white/95 p-3.5 shadow-[0_1px_0_rgba(18,24,40,0.02)]">
              <p className="text-[12px] font-semibold text-[#2a2d43]">Signal Breakdown</p>
              <div className="mt-2 space-y-1.5">
                {seoSignals.map((signal) => (
                  <div key={signal.key} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] text-[#3f4258]">{signal.label}</p>
                      <p className="text-[11px] text-[#8b8ea4]">{signal.detail}</p>
                    </div>
                    <span className={`text-[10px] uppercase ${statusTone(signal.status).text}`}>
                      {signal.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
