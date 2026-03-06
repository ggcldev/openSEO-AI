"use client";

import { useMemo, useRef, useState } from "react";
import type { HistoryItem } from "@/types";
import { useClickOutside } from "@/hooks/useClickOutside";

interface AuditListProps {
  items: HistoryItem[];
  optimizingJobId: number | null;
  onOpenEditor: (jobId: number) => void;
  onOpenDetails: (jobId: number) => void;
  onOptimizeJob: (jobId: number) => void;
}

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(seconds);

  if (absSeconds < 60) return RELATIVE_TIME_FORMATTER.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return RELATIVE_TIME_FORMATTER.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE_TIME_FORMATTER.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return RELATIVE_TIME_FORMATTER.format(days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return RELATIVE_TIME_FORMATTER.format(months, "month");
  const years = Math.round(months / 12);
  return RELATIVE_TIME_FORMATTER.format(years, "year");
}

function displayRegion(value: string | null | undefined): string {
  const normalized = (value || "").trim();
  if (!normalized) return "Global";
  if (normalized.toLowerCase() === "global") return "Global";
  return normalized;
}

function compactUrl(value: string): string {
  return value || "";
}

function deriveKeywordFromUrl(value: string): string {
  if (!value) return "New audit";
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1] || parsed.hostname.replace(/^www\./i, "");
    const normalized = lastSegment
      .replace(/\.[a-z0-9]{2,6}$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return normalized || parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "New audit";
  }
}

function displayKeyword(item: HistoryItem): string {
  const explicit = (item.keyword || "").trim();
  if (explicit) return explicit;
  return deriveKeywordFromUrl(item.url);
}

function statusLabel(status: HistoryItem["status"]): string {
  if (status === "done") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "running") return "Running";
  return "Pending";
}

function statusBadge(status: HistoryItem["status"]) {
  const label = statusLabel(status);

  if (status === "done") {
    return (
      <span className="inline-flex h-6 items-center rounded-full border border-[#d7ecdf] bg-[#f4fbf6] px-2.5 text-[11px] font-semibold text-[#25663d]">
        {label}
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="inline-flex h-6 items-center rounded-full border border-[#f2d2cf] bg-[#fff5f4] px-2.5 text-[11px] font-semibold text-[#9d3a34]">
        {label}
      </span>
    );
  }

  if (status === "running") {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[#d8e3fa] bg-[#f2f6ff] px-2.5 text-[11px] font-semibold text-[#3059ba]">
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M10 2.5a7.5 7.5 0 1 1-5.3 2.2" strokeLinecap="round" />
        </svg>
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[#e5e9f2] bg-[#f7f8fb] px-2.5 text-[11px] font-semibold text-[#4d566d]">
      <span className="h-2 w-2 animate-pulse rounded-full bg-[#7e869a]" />
      {label}
    </span>
  );
}

export function AuditList({
  items,
  optimizingJobId,
  onOpenEditor,
  onOpenDetails,
  onOptimizeJob,
}: AuditListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [menuJobId, setMenuJobId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useClickOutside(menuRef, () => setMenuJobId(null), {
    enabled: menuJobId !== null,
    closeOnEscape: true,
  });

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (items.length === 0) {
    return (
      <div className="bg-white py-8">
        <p className="text-[13px] text-[#7a7e8f]">No audit runs yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white">
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-[12px] font-medium text-[#737b92]">{items.length} audit runs</p>
        {selectedCount > 0 && <p className="text-[12px] text-[#6a6f82]">{selectedCount} selected</p>}
      </div>

      <div className="divide-y divide-[#edf1f7] rounded-xl border border-[#edf1f7] bg-white">
        {items.map((item) => {
          const selected = selectedIds.has(item.id);
          const canOptimize = item.can_optimize;
          const isBusy = item.status === "pending" || item.status === "running";
          const isOptimizing = optimizingJobId === item.id;
          const hasEditorArtifacts = item.has_source_html || item.has_export;
          const editorDisabled = isBusy || !hasEditorArtifacts;
          const editorDisabledTitle = isBusy
            ? "Editor opens after this run finishes."
            : !hasEditorArtifacts
              ? "No HTML artifacts yet. Run scan or optimize first."
              : undefined;
          const urlText = compactUrl(item.url);
          const keywordText = displayKeyword(item);
          const whenText = formatRelativeTime(item.finished_at || item.created_at);
          const menuOpen = menuJobId === item.id;

          return (
            <article
              key={item.id}
              className={`relative transition-colors ${
                selected
                  ? "bg-[#fafcff]"
                  : "bg-white hover:bg-[#fcfdff]"
              }`}
            >
              <div className="grid grid-cols-[34px_minmax(0,1fr)] md:grid-cols-[40px_minmax(0,1fr)_170px]">
                <div className="flex items-start justify-center pt-4">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(item.id)}
                    aria-label={`Select audit run ${item.id}`}
                    className="h-4 w-4 rounded border-[#c5cad8] text-[#2f354b] focus:ring-[#2f354b]"
                  />
                </div>

                <div className="min-w-0 px-2.5 py-3.5 md:px-3.5">
                  <button
                    type="button"
                    onClick={() => onOpenDetails(item.id)}
                    className="flex min-w-0 max-w-full items-baseline gap-1.5 text-left"
                  >
                    <span className="text-[16px] font-semibold text-[#171b29]">{keywordText}</span>
                    <span className="truncate text-[14px] text-[#555e77]">{urlText}</span>
                  </button>

                  <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[#687188]">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <rect x="2.8" y="3.5" width="14.4" height="9.5" rx="1.6" />
                      <path d="M6.8 16.5h6.4M10 13v3.5" strokeLinecap="round" />
                    </svg>
                    <span>{displayRegion(item.region)}</span>
                    <span aria-hidden="true" className="text-[#a0a7ba]">•</span>
                    <span className="text-[#7a8196]">Job #{item.id}</span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenEditor(item.id)}
                      disabled={editorDisabled}
                      className="inline-flex h-8 items-center rounded-lg border border-[#dfe4ef] bg-white px-3 text-[12px] font-semibold text-[#30364b] hover:bg-[#f7f9fd] disabled:opacity-45"
                      title={editorDisabledTitle}
                    >
                      Open editor
                    </button>
                    {canOptimize && (
                      <button
                        type="button"
                        onClick={() => onOptimizeJob(item.id)}
                        disabled={isBusy || isOptimizing}
                        className="inline-flex h-8 items-center rounded-lg border border-[#dfe4ef] bg-white px-3 text-[12px] font-semibold text-[#30364b] hover:bg-[#f7f9fd] disabled:opacity-45"
                      >
                        {isOptimizing ? "Optimizing..." : item.has_export ? "Refresh optimize" : "Auto-optimize"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenDetails(item.id)}
                      className="inline-flex h-8 items-center px-1 text-[12px] font-semibold text-[#516082] underline underline-offset-2 hover:text-[#1f2435]"
                    >
                      Details
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between md:hidden">
                    {statusBadge(item.status)}
                    <div className="flex items-center gap-2">
                      <p className="text-[12px] text-[#7a8196]">{whenText}</p>
                      <button
                        type="button"
                        onClick={() => setMenuJobId((prev) => (prev === item.id ? null : item.id))}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#4e5366] hover:bg-[#eef2fa]"
                        aria-label={`More actions for audit ${item.id}`}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <circle cx="4.2" cy="10" r="1.2" />
                          <circle cx="10" cy="10" r="1.2" />
                          <circle cx="15.8" cy="10" r="1.2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="hidden md:flex flex-col items-end justify-between px-3.5 py-3.5">
                  <div className="flex items-center gap-1.5">
                    {statusBadge(item.status)}
                    <button
                      type="button"
                      onClick={() => setMenuJobId((prev) => (prev === item.id ? null : item.id))}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#4e5366] hover:bg-[#eef2fa]"
                      aria-label={`More actions for audit ${item.id}`}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <circle cx="4.2" cy="10" r="1.2" />
                        <circle cx="10" cy="10" r="1.2" />
                        <circle cx="15.8" cy="10" r="1.2" />
                      </svg>
                    </button>
                  </div>

                  <p className="text-[12px] text-[#7a8196]">{whenText}</p>
                </div>
              </div>

              {menuOpen && (
                <div
                  ref={menuRef}
                  className="absolute right-3 top-10 z-20 min-w-[176px] rounded-xl border border-[#dde1eb] bg-white p-1.5 shadow-[0_14px_34px_rgba(30,36,56,0.16)]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuJobId(null);
                      onOpenDetails(item.id);
                    }}
                    className="block w-full rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-[#30354a] hover:bg-[#f4f6fb]"
                  >
                    View details
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuJobId(null);
                      onOpenEditor(item.id);
                    }}
                    disabled={editorDisabled}
                    className="block w-full rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-[#30354a] hover:bg-[#f4f6fb] disabled:opacity-45"
                    title={editorDisabledTitle}
                  >
                    Open editor
                  </button>
                  {canOptimize && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuJobId(null);
                        onOptimizeJob(item.id);
                      }}
                      disabled={isBusy || isOptimizing}
                      className="block w-full rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-[#30354a] hover:bg-[#f4f6fb] disabled:opacity-45"
                    >
                      {isOptimizing ? "Optimizing..." : "Auto-optimize"}
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
