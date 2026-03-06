"use client";

import type { Goal } from "@/types";
import type { Notice } from "@/lib/notice";
import { noticeTextClass } from "@/lib/notice";

interface ScanFormProps {
  url: string;
  keyword: string;
  showSettings: boolean;
  goal: Goal;
  numCompetitors: number;
  loading: boolean;
  message: Notice | null;
  onSubmit: (event: React.FormEvent) => void;
  onUrlChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onToggleSettings: () => void;
  onGoalChange: (value: string) => void;
  onNumCompetitorsChange: (value: string) => void;
}

export function ScanForm({
  url,
  keyword,
  showSettings,
  goal,
  numCompetitors,
  loading,
  message,
  onSubmit,
  onUrlChange,
  onKeywordChange,
  onToggleSettings,
  onGoalChange,
  onNumCompetitorsChange,
}: ScanFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="single-url" className="text-[12px] font-medium text-[#57617b]">
          Target URL
        </label>
        <input
          id="single-url"
          type="url"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder="https://example.com/page"
          required
          className="h-11 w-full rounded-xl border border-[#d9dfeb] bg-white px-4 text-[14px] text-[#1a1a1a] placeholder-[#9aa3b8] shadow-sm"
        />
      </div>

      <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_auto]">
        <div className="space-y-2">
          <label htmlFor="single-keyword" className="text-[12px] font-medium text-[#57617b]">
            Primary Keyword
          </label>
          <input
            id="single-keyword"
            type="text"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="Optional (auto-detected if empty)"
            className="h-11 w-full rounded-xl border border-[#d9dfeb] bg-white px-4 text-[14px] text-[#1a1a1a] placeholder-[#9aa3b8] shadow-sm"
          />
        </div>

        <button
          type="button"
          onClick={onToggleSettings}
          className="h-11 rounded-xl border border-[#d9dfeb] bg-white px-3 text-[13px] font-medium text-[#3d4356] hover:bg-[#f7f9fc]"
        >
          {showSettings ? "Hide Advanced" : "Advanced"}
        </button>

        <button
          type="submit"
          disabled={loading}
          className="h-11 rounded-xl bg-[#121420] px-5 text-[13px] font-semibold text-white hover:bg-[#22263a] disabled:opacity-45"
        >
          {loading ? "Scanning..." : "Scan"}
        </button>
      </div>

      {showSettings && (
        <div className="grid gap-4 rounded-xl border border-[#e6eaf3] bg-[#fafbfe] p-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="single-goal" className="text-[12px] font-medium text-[#57617b]">
              Goal
            </label>
            <select
              id="single-goal"
              value={goal}
              onChange={(event) => onGoalChange(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#d9dfeb] bg-white px-3 text-[13px] text-[#3f455a]"
            >
              <option value="leads">Leads</option>
              <option value="awareness">Awareness</option>
              <option value="product_info">Product Info</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="single-competitors" className="text-[12px] font-medium text-[#57617b]">
              Competitors ({numCompetitors})
            </label>
            <input
              id="single-competitors"
              type="range"
              min={3}
              max={20}
              value={numCompetitors}
              onChange={(event) => onNumCompetitorsChange(event.target.value)}
              className="w-full accent-[#2f3650]"
            />
          </div>
        </div>
      )}

      {message && <p className={`text-[13px] font-medium ${noticeTextClass(message)}`}>{message.text}</p>}
    </form>
  );
}
