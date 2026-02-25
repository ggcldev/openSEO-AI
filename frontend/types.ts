export interface OptimizeRequest {
  url: string;
  keyword?: string;
  goal?: string;
  num_competitors?: number;
}

export interface OptimizeResponse {
  id: number;
  url: string;
  keyword: string;
  status: string;
  message: string;
}

export interface HistoryItem {
  id: number;
  url: string;
  keyword: string;
  goal: string | null;
  status: "pending" | "running" | "done" | "failed";
  detected_intent: string | null;
  page_type: string | null;
  region: string | null;
  language: string | null;
  audit_result: string | null;
  has_export: boolean;
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
  headings_plan?: { recommended_h1: string; outline: { tag: string; text: string; status: string; note: string }[] };
  faq_pack?: { question: string; answer: string }[];
  word_count?: { yours: number; serp_avg: number; serp_top: number; recommendation: string };
  content_gaps?: string[];
  strengths?: string[];
  change_summary?: { keep: string[]; change: string[] };
  checklist?: { task: string; location: string; priority: number }[];
  parse_error?: boolean;
  raw_output?: string;
}

export interface HistoryFilters {
  status?: string;
  limit?: number;
}
