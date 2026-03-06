import { z } from "zod";

const goalSchema = z.enum(["leads", "awareness", "product_info"]);
const pipelineModeSchema = z.enum(["scan", "full", "optimize"]);
const jobStatusSchema = z.enum(["pending", "running", "done", "failed"]);

export const optimizeResponseSchema = z.object({
  id: z.number(),
  url: z.string(),
  keyword: z.string(),
  status: z.string(),
  pipeline_mode: pipelineModeSchema,
  message: z.string(),
});

export const historyItemSchema = z.object({
  id: z.number(),
  url: z.string(),
  keyword: z.string(),
  goal: goalSchema.nullable(),
  num_competitors: z.number().nullable(),
  pipeline_mode: pipelineModeSchema.nullable(),
  status: jobStatusSchema,
  detected_intent: z.string().nullable(),
  page_type: z.string().nullable(),
  region: z.string().nullable(),
  language: z.string().nullable(),
  error_stage: z.string().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  audit_result: z.string().nullable(),
  has_source_html: z.boolean(),
  has_export: z.boolean(),
  can_optimize: z.boolean(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
});

export const historyItemsSchema = z.array(historyItemSchema);

export const editorDocumentSchema = z.object({
  id: z.number(),
  url: z.string(),
  status: z.string(),
  source_html: z.string().nullable(),
  optimized_html: z.string().nullable(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
});

export const scheduleItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  url: z.string(),
  keyword: z.string(),
  goal: goalSchema,
  num_competitors: z.number(),
  interval_minutes: z.number(),
  is_active: z.boolean(),
  last_enqueued_at: z.string().nullable(),
  next_run_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const scheduleItemsSchema = z.array(scheduleItemSchema);

export const runScheduleNowResponseSchema = z.object({
  schedule_id: z.number(),
  job_id: z.number(),
  status: z.string(),
});

export const bulkUploadResponseSchema = z.object({
  submitted_count: z.number(),
  rejected_count: z.number(),
  submitted_job_ids: z.array(z.number()),
  rejected_rows: z.array(
    z.object({
      row: z.number(),
      reason: z.string(),
      raw_url: z.string().nullable().optional(),
    }),
  ),
});

const reliabilityBreakdownItemSchema = z.object({
  key: z.string(),
  count: z.number(),
});

export const reliabilitySummarySchema = z.object({
  window_days: z.number(),
  since: z.string(),
  generated_at: z.string(),
  queue_backlog: z.number(),
  due_backlog: z.number(),
  running_jobs: z.number(),
  stale_running_jobs: z.number(),
  active_workers: z.number(),
  heartbeat_enabled: z.boolean(),
  database_backend: z.string(),
  submitted_jobs: z.number(),
  completed_jobs: z.number(),
  done_jobs: z.number(),
  failed_jobs: z.number(),
  scrape_failed_jobs: z.number(),
  retried_jobs: z.number(),
  retry_pending_jobs: z.number(),
  scrape_success_rate: z.number(),
  job_success_rate: z.number(),
  p95_completion_minutes: z.number().nullable(),
  targets: z.object({
    scrape_success_rate_target: z.number(),
    job_success_rate_target: z.number(),
    p95_completion_minutes_target: z.number(),
  }),
  alerts: z.array(z.string()),
  failure_codes: z.array(reliabilityBreakdownItemSchema),
  failure_domains: z.array(reliabilityBreakdownItemSchema),
});
