export type Goal = "leads" | "awareness" | "product_info";

export interface OptimizeRequest {
  url: string;
  keyword?: string;
  goal?: Goal;
  num_competitors?: number;
}

export interface OptimizeResponse {
  id: number;
  url: string;
  keyword: string;
  status: string;
  pipeline_mode: "scan" | "full" | "optimize";
  message: string;
}

export interface HistoryItem {
  id: number;
  url: string;
  keyword: string;
  goal: Goal | null;
  num_competitors: number | null;
  pipeline_mode: "scan" | "full" | "optimize" | null;
  status: "pending" | "running" | "done" | "failed";
  detected_intent: string | null;
  page_type: string | null;
  region: string | null;
  language: string | null;
  error_stage: string | null;
  error_code: string | null;
  error_message: string | null;
  audit_result: string | null;
  has_source_html: boolean;
  has_export: boolean;
  can_optimize: boolean;
  created_at: string;
  finished_at: string | null;
}

export interface AuditResult {
  overall_score: number;
  priority_action?: string;
  effort_level?: string;
  keywords?: { primary: string; secondary: string[]; intent_cluster: string };
  title_tag?: { current: string; options: string[] };
  meta_description?: { options: string[] };
  headings_plan?: {
    recommended_h1: string;
    outline: { tag: string; text: string; status: string; note: string }[];
  };
  faq_pack?: { question: string; answer: string }[];
  word_count?: {
    yours: number;
    serp_avg: number;
    serp_top: number;
    recommendation: string;
  };
  content_gaps?: string[];
  strengths?: string[];
  change_summary?: { keep: string[]; change: string[] };
  checklist?: { task: string; location: string; priority: number }[];
  parse_error?: boolean;
  raw_output?: string;
}

export interface HistoryFilters {
  status?: string;
  keyword?: string;
  url?: string;
  limit?: number;
  include_audit?: boolean;
}

export interface EditorDocument {
  id: number;
  url: string;
  status: string;
  source_html: string | null;
  optimized_html: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface ScheduleItem {
  id: number;
  name: string;
  url: string;
  keyword: string;
  goal: Goal;
  num_competitors: number;
  interval_minutes: number;
  is_active: boolean;
  last_enqueued_at: string | null;
  next_run_at: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleCreateRequest {
  name: string;
  url: string;
  keyword?: string;
  goal?: Goal;
  num_competitors?: number;
  interval_minutes?: number;
  start_at?: string;
  is_active?: boolean;
}

export interface BulkUploadResponse {
  submitted_count: number;
  rejected_count: number;
  submitted_job_ids: number[];
  rejected_rows: { row: number; reason: string; raw_url?: string | null }[];
}

export interface ReliabilityBreakdownItem {
  key: string;
  count: number;
}

export interface ReliabilitySummary {
  window_days: number;
  since: string;
  generated_at: string;

  queue_backlog: number;
  due_backlog: number;
  running_jobs: number;
  stale_running_jobs: number;
  active_workers: number;
  heartbeat_enabled: boolean;
  database_backend: string;

  submitted_jobs: number;
  completed_jobs: number;
  done_jobs: number;
  failed_jobs: number;
  scrape_failed_jobs: number;
  retried_jobs: number;
  retry_pending_jobs: number;

  scrape_success_rate: number;
  job_success_rate: number;
  p95_completion_minutes: number | null;

  targets: {
    scrape_success_rate_target: number;
    job_success_rate_target: number;
    p95_completion_minutes_target: number;
  };

  alerts: string[];
  failure_codes: ReliabilityBreakdownItem[];
  failure_domains: ReliabilityBreakdownItem[];
}
