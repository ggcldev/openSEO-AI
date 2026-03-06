"use client";

import { useEffect, useRef } from "react";
import type { HistoryItem } from "@/types";

interface UseHistoryPollingInput {
  history: HistoryItem[];
  fetchHistory: () => Promise<void> | void;
  runningIntervalMs: number;
  pendingIntervalMs: number;
  hiddenIntervalMs: number;
}

/**
 * Polls history while there are active jobs, with adaptive intervals:
 * - running jobs: faster poll
 * - pending-only jobs: slower poll
 * - hidden tab: slowest poll
 */
export function useHistoryPolling({
  history,
  fetchHistory,
  runningIntervalMs,
  pendingIntervalMs,
  hiddenIntervalMs,
}: UseHistoryPollingInput): void {
  const hasRunningHistoryJobsRef = useRef(false);
  const hasPendingHistoryJobsRef = useRef(false);
  const isPollingRef = useRef(false);

  useEffect(() => {
    hasRunningHistoryJobsRef.current = history.some((job) => job.status === "running");
    hasPendingHistoryJobsRef.current = history.some((job) => job.status === "pending");
  }, [history]);

  useEffect(() => {
    let timeoutId: number | null = null;
    let cancelled = false;

    function getNextIntervalMs(): number | null {
      const hasRunning = hasRunningHistoryJobsRef.current;
      const hasPending = hasPendingHistoryJobsRef.current;
      if (!hasRunning && !hasPending) {
        return null;
      }
      if (document.visibilityState === "hidden") {
        return hiddenIntervalMs;
      }
      return hasRunning ? runningIntervalMs : pendingIntervalMs;
    }

    function scheduleNextPoll() {
      if (cancelled) {
        return;
      }
      const nextMs = getNextIntervalMs();
      if (nextMs === null) {
        return;
      }
      timeoutId = window.setTimeout(async () => {
        if (cancelled) {
          return;
        }
        if (!isPollingRef.current && document.visibilityState !== "hidden") {
          isPollingRef.current = true;
          try {
            await fetchHistory();
          } finally {
            isPollingRef.current = false;
          }
        }
        scheduleNextPoll();
      }, nextMs);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (hasRunningHistoryJobsRef.current || hasPendingHistoryJobsRef.current) {
        void fetchHistory();
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      scheduleNextPoll();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleNextPoll();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [fetchHistory, hiddenIntervalMs, pendingIntervalMs, runningIntervalMs]);
}
