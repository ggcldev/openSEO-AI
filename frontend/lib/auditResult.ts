import type { AuditResult } from "@/types";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function asKeywordPayload(value: unknown): AuditResult["keywords"] | undefined {
  if (!isJsonObject(value)) return undefined;
  const primary = asString(value.primary);
  const secondary = asStringArray(value.secondary);
  const intentCluster = asString(value.intent_cluster);
  if (!primary && !secondary && !intentCluster) return undefined;
  return {
    primary: primary || "",
    secondary: secondary || [],
    intent_cluster: intentCluster || "",
  };
}

function asTitleTag(value: unknown): AuditResult["title_tag"] | undefined {
  if (!isJsonObject(value)) return undefined;
  const current = asString(value.current) || "";
  const options = asStringArray(value.options) || [];
  if (!current && options.length === 0) return undefined;
  return { current, options };
}

function asMetaDescription(value: unknown): AuditResult["meta_description"] | undefined {
  if (!isJsonObject(value)) return undefined;
  const options = asStringArray(value.options) || [];
  if (options.length === 0) return undefined;
  return { options };
}

function asHeadingsPlan(value: unknown): AuditResult["headings_plan"] | undefined {
  if (!isJsonObject(value)) return undefined;
  const recommendedH1 = asString(value.recommended_h1) || "";
  const rawOutline = Array.isArray(value.outline) ? value.outline : [];
  const outline = rawOutline
    .filter(isJsonObject)
    .map((entry) => ({
      tag: asString(entry.tag) || "h2",
      text: asString(entry.text) || "",
      status: asString(entry.status) || "add",
      note: asString(entry.note) || "",
    }))
    .filter((entry) => entry.text.length > 0);
  if (!recommendedH1 && outline.length === 0) return undefined;
  return { recommended_h1: recommendedH1, outline };
}

function asFaqPack(value: unknown): AuditResult["faq_pack"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .filter(isJsonObject)
    .map((entry) => ({
      question: asString(entry.question) || "",
      answer: asString(entry.answer) || "",
    }))
    .filter((entry) => entry.question.length > 0 || entry.answer.length > 0);
  return rows.length > 0 ? rows : undefined;
}

function asWordCount(value: unknown): AuditResult["word_count"] | undefined {
  if (!isJsonObject(value)) return undefined;
  const yours = asNumber(value.yours);
  const serpAvg = asNumber(value.serp_avg);
  const serpTop = asNumber(value.serp_top);
  const recommendation = asString(value.recommendation) || "";
  if (yours === undefined && serpAvg === undefined && serpTop === undefined && !recommendation) {
    return undefined;
  }
  return {
    yours: yours ?? 0,
    serp_avg: serpAvg ?? 0,
    serp_top: serpTop ?? 0,
    recommendation,
  };
}

function asChecklist(value: unknown): AuditResult["checklist"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .filter(isJsonObject)
    .map((entry) => ({
      task: asString(entry.task) || "",
      location: asString(entry.location) || "",
      priority: asNumber(entry.priority) ?? 999,
    }))
    .filter((entry) => entry.task.length > 0);
  return rows.length > 0 ? rows : undefined;
}

function asChangeSummary(value: unknown): AuditResult["change_summary"] | undefined {
  if (!isJsonObject(value)) return undefined;
  const keep = asStringArray(value.keep) || [];
  const change = asStringArray(value.change) || [];
  if (keep.length === 0 && change.length === 0) return undefined;
  return { keep, change };
}

export function parseAuditResult(auditResult: string | null | undefined): AuditResult | null {
  if (!auditResult) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(auditResult);
  } catch {
    return null;
  }

  if (!isJsonObject(parsed)) return null;

  const parseError = asBoolean(parsed.parse_error);
  const overallScore = asNumber(parsed.overall_score);
  if (overallScore === undefined && !parseError) return null;

  const result: AuditResult = {
    overall_score: overallScore ?? 0,
  };

  const priorityAction = asString(parsed.priority_action);
  if (priorityAction) result.priority_action = priorityAction;

  const effortLevel = asString(parsed.effort_level);
  if (effortLevel) result.effort_level = effortLevel;

  const keywords = asKeywordPayload(parsed.keywords);
  if (keywords) result.keywords = keywords;

  const titleTag = asTitleTag(parsed.title_tag);
  if (titleTag) result.title_tag = titleTag;

  const metaDescription = asMetaDescription(parsed.meta_description);
  if (metaDescription) result.meta_description = metaDescription;

  const headingsPlan = asHeadingsPlan(parsed.headings_plan);
  if (headingsPlan) result.headings_plan = headingsPlan;

  const faqPack = asFaqPack(parsed.faq_pack);
  if (faqPack) result.faq_pack = faqPack;

  const wordCount = asWordCount(parsed.word_count);
  if (wordCount) result.word_count = wordCount;

  const contentGaps = asStringArray(parsed.content_gaps);
  if (contentGaps) result.content_gaps = contentGaps;

  const strengths = asStringArray(parsed.strengths);
  if (strengths) result.strengths = strengths;

  const changeSummary = asChangeSummary(parsed.change_summary);
  if (changeSummary) result.change_summary = changeSummary;

  const checklist = asChecklist(parsed.checklist);
  if (checklist) result.checklist = checklist;

  if (parseError !== undefined) result.parse_error = parseError;

  const rawOutput = asString(parsed.raw_output);
  if (rawOutput) result.raw_output = rawOutput;

  return result;
}
