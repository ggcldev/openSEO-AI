"use client";

import { AuditList } from "@/components/dashboard/AuditList";
import type { HistoryItem } from "@/types";
import type { Notice } from "@/lib/notice";
import { noticeTextClass } from "@/lib/notice";

interface HistorySectionProps {
  filterStatus: string;
  historyMessage: Notice | null;
  items: HistoryItem[];
  optimizingJobId: number | null;
  onFilterStatusChange: (value: string) => void;
  onOpenEditor: (jobId: number) => void;
  onOpenDetails: (jobId: number) => void;
  onOptimizeJob: (jobId: number) => void;
}

export function HistorySection({
  filterStatus,
  historyMessage,
  items,
  optimizingJobId,
  onFilterStatusChange,
  onOpenEditor,
  onOpenDetails,
  onOptimizeJob,
}: HistorySectionProps) {
  return (
    <section className="bg-white pt-1">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[#eef2f8] pb-3">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-[#171b29]">Audit</h2>
          <p className="mt-1 text-[13px] text-[#6f7891]">
            Track scan and optimization runs in one audit feed.
          </p>
        </div>
        <select
          value={filterStatus}
          onChange={(event) => onFilterStatusChange(event.target.value)}
          className="h-9 rounded-lg border border-[#dde2ee] bg-white px-3 text-[13px] text-[#46516c]"
        >
          <option value="">All audit statuses</option>
          <option value="pending">Pending</option>
          <option value="done">Done</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {historyMessage && (
        <p className={`text-[12px] mb-3 ${noticeTextClass(historyMessage)}`}>{historyMessage.text}</p>
      )}
      <AuditList
        items={items}
        onOpenEditor={onOpenEditor}
        onOpenDetails={onOpenDetails}
        onOptimizeJob={onOptimizeJob}
        optimizingJobId={optimizingJobId}
      />
    </section>
  );
}
