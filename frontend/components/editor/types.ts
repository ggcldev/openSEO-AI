"use client";

export type SignalStatus = "pass" | "warn" | "fail";
export type TermStatus = "low" | "good" | "high";
export type SideTab = "guidelines" | "facts" | "outline";

export interface SeoSignal {
  key: string;
  label: string;
  status: SignalStatus;
  score: number;
  maxScore: number;
  detail: string;
  recommendation: string;
}

export interface TermSignal {
  term: string;
  count: number;
  min: number;
  max: number;
  status: TermStatus;
}
