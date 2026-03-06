"use client";

import type { TermStatus, TermSignal } from "@/components/editor/types";

interface TermFrequencyPanelProps {
  termQuery: string;
  filteredTerms: TermSignal[];
  onTermQueryChange: (value: string) => void;
}

function termTone(status: TermStatus): string {
  if (status === "good") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "high") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-red-50 text-red-700 border-red-200";
}

export function TermFrequencyPanel({
  termQuery,
  filteredTerms,
  onTermQueryChange,
}: TermFrequencyPanelProps) {
  return (
    <section className="rounded-2xl border border-[#e4e8f3] bg-white/95 p-3.5 shadow-[0_1px_0_rgba(18,24,40,0.02)]">
      <p className="text-[12px] font-semibold text-[#2a2d43]">Keywords</p>
      <input
        type="text"
        value={termQuery}
        onChange={(event) => onTermQueryChange(event.target.value)}
        placeholder="Search keywords"
        className="mt-2 h-10 w-full rounded-xl border border-[#dce2f1] bg-[#fbfcff] px-3 text-[12px] transition-all duration-150 focus:border-[#b5c0e5] focus:outline-none focus:ring-2 focus:ring-[#b8c1e6]/45"
      />
      <div className="mt-2 max-h-56 space-y-1.5 overflow-auto pr-1">
        {filteredTerms.slice(0, 30).map((entry) => (
          <div key={entry.term} className={`rounded-lg border px-2.5 py-1.5 text-[12px] ${termTone(entry.status)}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{entry.term}</span>
              <span className="font-semibold tabular-nums">
                {entry.count}/{entry.min}-{entry.max}
              </span>
            </div>
          </div>
        ))}
        {filteredTerms.length === 0 && (
          <p className="text-[12px] text-[#9a9db2] py-1">No keywords match this query.</p>
        )}
      </div>
    </section>
  );
}
