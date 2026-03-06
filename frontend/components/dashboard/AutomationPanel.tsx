"use client";

import type { RefObject } from "react";
import type { Goal, ScheduleItem } from "@/types";
import type { Notice } from "@/lib/notice";
import { noticeTextClass } from "@/lib/notice";
import { formatDateTimeWithTimezone } from "@/lib/dateTime";

interface ScheduleFormValues {
  name: string;
  url: string;
  keyword: string;
  goal: Goal;
  numCompetitors: number;
  intervalMinutes: number;
}

interface AutomationPanelProps {
  showAutomation: boolean;
  onToggleAutomation: () => void;
  automationMenuRef: RefObject<HTMLDivElement | null>;
  opsTab: "bulk" | "schedule";
  onOpsTabChange: (tab: "bulk" | "schedule") => void;
  bulkFile: File | null;
  bulkLoading: boolean;
  bulkMessage: Notice | null;
  onBulkUpload: (event: React.FormEvent) => void;
  onBulkFileChange: (file: File | null) => void;
  scheduleForm: ScheduleFormValues;
  scheduleLoading: boolean;
  scheduleMessage: Notice | null;
  schedules: ScheduleItem[];
  onCreateSchedule: (event: React.FormEvent) => void;
  onScheduleNameChange: (value: string) => void;
  onScheduleUrlChange: (value: string) => void;
  onScheduleKeywordChange: (value: string) => void;
  onScheduleGoalChange: (value: string) => void;
  onScheduleNumCompetitorsChange: (value: string) => void;
  onScheduleIntervalMinutesChange: (value: string) => void;
  onRunScheduleNow: (scheduleId: number) => void;
  onDeactivateSchedule: (scheduleId: number) => void;
}

export function AutomationPanel({
  showAutomation,
  onToggleAutomation,
  automationMenuRef,
  opsTab,
  onOpsTabChange,
  bulkFile,
  bulkLoading,
  bulkMessage,
  onBulkUpload,
  onBulkFileChange,
  scheduleForm,
  scheduleLoading,
  scheduleMessage,
  schedules,
  onCreateSchedule,
  onScheduleNameChange,
  onScheduleUrlChange,
  onScheduleKeywordChange,
  onScheduleGoalChange,
  onScheduleNumCompetitorsChange,
  onScheduleIntervalMinutesChange,
  onRunScheduleNow,
  onDeactivateSchedule,
}: AutomationPanelProps) {
  return (
    <div ref={automationMenuRef} className="relative">
      <button
        type="button"
        onClick={onToggleAutomation}
        className="h-10 rounded-xl border border-[#d8deeb] bg-white px-3 text-[12px] font-semibold text-[#404960] hover:bg-[#f7f9fc]"
      >
        {showAutomation ? "Close Automation" : "Automation"}
      </button>

      {showAutomation && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-20 w-[min(92vw,760px)] overflow-hidden rounded-xl border border-[#e2e7f0] bg-white shadow-[0_16px_40px_rgba(19,29,52,0.14)]">
          <div className="border-b border-[#edf1f7] px-4 py-3">
            <p className="text-[13px] font-semibold text-[#1a1a1a]">Batch & Automation</p>
            <p className="mt-0.5 text-[12px] text-[#727b93]">Bulk upload and recurring scan operations.</p>
          </div>

          <div className="p-4 max-h-[70vh] overflow-auto">
            <div className="mb-4 inline-flex rounded-lg bg-[#f4f6fb] p-1">
              <button
                type="button"
                onClick={() => onOpsTabChange("bulk")}
                className={`px-3 py-1.5 text-[12px] rounded-md ${
                  opsTab === "bulk"
                    ? "border border-[#d8deeb] bg-white text-[#1a1a1a]"
                    : "text-[#687188]"
                }`}
              >
                Bulk Upload
              </button>
              <button
                type="button"
                onClick={() => onOpsTabChange("schedule")}
                className={`px-3 py-1.5 text-[12px] rounded-md ${
                  opsTab === "schedule"
                    ? "border border-[#d8deeb] bg-white text-[#1a1a1a]"
                    : "text-[#687188]"
                }`}
              >
                Schedules
              </button>
            </div>

            {opsTab === "bulk" && (
              <form onSubmit={onBulkUpload} className="space-y-3">
                <p className="text-[12px] text-[#777]">
                  Expected columns: <code>url</code> (required), <code>keyword</code>, <code>goal</code>,{" "}
                  <code>num_competitors</code>
                </p>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(event) => onBulkFileChange(event.target.files?.[0] || null)}
                  className="w-full text-[12px] text-[#666] border border-[#e0e0e0] rounded-lg px-3 py-2 bg-[#f7f7f7]"
                />
                <button
                  type="submit"
                  disabled={bulkLoading || !bulkFile}
                  className="bg-[#1a1a1a] text-[#fcfcfc] text-[12px] font-medium px-4 py-2 rounded-lg hover:bg-[#333] disabled:opacity-30"
                >
                  {bulkLoading ? "Uploading..." : "Upload & Queue"}
                </button>
                {bulkMessage && (
                  <p className={`text-[12px] ${noticeTextClass(bulkMessage)}`}>{bulkMessage.text}</p>
                )}
              </form>
            )}

            {opsTab === "schedule" && (
              <div className="grid lg:grid-cols-2 gap-4">
                <form onSubmit={onCreateSchedule} className="space-y-3">
                  <input
                    type="text"
                    value={scheduleForm.name}
                    onChange={(event) => onScheduleNameChange(event.target.value)}
                    placeholder="Schedule name"
                    className="w-full bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]"
                    required
                  />
                  <input
                    type="url"
                    value={scheduleForm.url}
                    onChange={(event) => onScheduleUrlChange(event.target.value)}
                    placeholder="https://example.com/page"
                    className="w-full bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]"
                    required
                  />
                  <input
                    type="text"
                    value={scheduleForm.keyword}
                    onChange={(event) => onScheduleKeywordChange(event.target.value)}
                    placeholder="Keyword (optional)"
                    className="w-full bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={scheduleForm.goal}
                      onChange={(event) => onScheduleGoalChange(event.target.value)}
                      className="bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-2 py-2 text-[12px]"
                    >
                      <option value="leads">Leads</option>
                      <option value="awareness">Awareness</option>
                      <option value="product_info">Product Info</option>
                    </select>
                    <input
                      type="number"
                      min={3}
                      max={20}
                      value={scheduleForm.numCompetitors}
                      onChange={(event) => onScheduleNumCompetitorsChange(event.target.value)}
                      className="bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-2 py-2 text-[12px]"
                      title="Competitors"
                    />
                    <input
                      type="number"
                      min={15}
                      max={10080}
                      value={scheduleForm.intervalMinutes}
                      onChange={(event) => onScheduleIntervalMinutesChange(event.target.value)}
                      className="bg-[#f7f7f7] border border-[#e0e0e0] rounded-lg px-2 py-2 text-[12px]"
                      title="Interval minutes"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={scheduleLoading}
                    className="bg-[#1a1a1a] text-[#fcfcfc] text-[12px] font-medium px-4 py-2 rounded-lg hover:bg-[#333] disabled:opacity-30"
                  >
                    {scheduleLoading ? "Creating..." : "Create Schedule"}
                  </button>
                  {scheduleMessage && (
                    <p className={`text-[12px] ${noticeTextClass(scheduleMessage)}`}>
                      {scheduleMessage.text}
                    </p>
                  )}
                </form>

                <div className="border border-[#eee] rounded-xl p-3 max-h-64 overflow-auto space-y-2">
                  {schedules.map((schedule) => (
                    <div key={schedule.id} className="border border-[#eee] rounded-lg p-2 text-[12px]">
                      <p className="text-[#1a1a1a] font-medium">{schedule.name}</p>
                      <p className="text-[#888] truncate">{schedule.url}</p>
                      <p className="text-[#aaa]">
                        Every {schedule.interval_minutes} min • next{" "}
                        {formatDateTimeWithTimezone(schedule.next_run_at)}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => onRunScheduleNow(schedule.id)}
                          disabled={!schedule.is_active}
                          className="border border-[#ddd] text-[#444] text-[11px] px-2 py-1 rounded hover:border-[#bbb] disabled:opacity-40"
                        >
                          Run now
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeactivateSchedule(schedule.id)}
                          disabled={!schedule.is_active}
                          className="border border-[#ddd] text-[#444] text-[11px] px-2 py-1 rounded hover:border-[#bbb] disabled:opacity-40"
                        >
                          Deactivate
                        </button>
                      </div>
                    </div>
                  ))}
                  {schedules.length === 0 && <p className="text-[12px] text-[#aaa]">No schedules yet</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
