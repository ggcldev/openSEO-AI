export interface OptimizeRequest {
  url: string;
  keyword?: string;
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
  status: "pending" | "running" | "done" | "failed";
  detected_intent: string | null;
  page_type: string | null;
  audit_result: string | null;
  competitor_urls: string | null;
  has_export: boolean;
  created_at: string;
  finished_at: string | null;
}

export interface AuditResult {
  overall_score: number;
  title_tag: {
    current: string;
    status: string;
    recommendation: string;
  };
  meta_description: {
    status: string;
    recommendation: string;
  };
  headings: {
    h1_count: number;
    h2_count: number;
    status: string;
    recommendation: string;
  };
  word_count: {
    yours: number;
    serp_avg: number;
    serp_top: number;
    status: string;
    recommendation: string;
  };
  keyword_usage: {
    density_yours: number;
    density_serp_avg: number;
    status: string;
    recommendation: string;
  };
  content_gaps: string[];
  strengths: string[];
  recommendations: {
    priority: number;
    type: string;
    action: string;
    rationale: string;
  }[];
  parse_error?: boolean;
  raw_output?: string;
}

export interface HistoryFilters {
  status?: string;
  keyword?: string;
  url?: string;
  limit?: number;
}
