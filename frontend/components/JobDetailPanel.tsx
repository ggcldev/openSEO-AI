"use client";

import { useState } from "react";
import type { AuditResult, HistoryItem } from "@/types";
import { getExportUrl, getSourceExportUrl } from "@/lib/apiClient";
import { parseAuditResult } from "@/lib/auditResult";
import { formatDateTimeWithTimezone } from "@/lib/dateTime";

interface Props {
  item: HistoryItem | null;
  loadingAudit?: boolean;
  onClose: () => void;
  onRetryScan: (item: HistoryItem) => void;
  onOptimizeJob: (jobId: number) => void;
  onOpenEditor: (jobId: number) => void;
  retryScanJobId: number | null;
  optimizingJobId: number | null;
}

type RowTone = "good" | "warn" | "critical" | "info";

interface DetailRow {
  id: string;
  tone: RowTone;
  heading: string;
  metric: string;
  description: string;
  details: string;
}

interface DetailSection {
  id: string;
  title: string;
  rows: DetailRow[];
}

function statusLabel(status: HistoryItem["status"]): string {
  if (status === "done") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "running") return "Running";
  return "Pending";
}

function statusChip(status: HistoryItem["status"]) {
  const label = statusLabel(status);

  if (status === "done") {
    return (
      <span className="inline-flex h-7 items-center rounded-full bg-[#e7f8ee] px-3 text-[12px] font-semibold text-[#1f9d5a]">
        {label}
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="inline-flex h-7 items-center rounded-full bg-[#fff2f1] px-3 text-[12px] font-semibold text-[#b42318]">
        {label}
      </span>
    );
  }

  if (status === "running") {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#edf4ff] px-3 text-[12px] font-semibold text-[#1f5ed8]">
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M10 2.5a7.5 7.5 0 1 1-5.3 2.2" strokeLinecap="round" />
        </svg>
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#f1f4f9] px-3 text-[12px] font-semibold text-[#48516b]">
      <span className="h-2 w-2 animate-pulse rounded-full bg-[#7e869a]" />
      {label}
    </span>
  );
}

function toneStyles(tone: RowTone): { icon: string; heading: string } {
  if (tone === "good") {
    return {
      icon: "text-[#1f9d5a]",
      heading: "text-[#1f9d5a]",
    };
  }

  if (tone === "critical") {
    return {
      icon: "text-[#c43228]",
      heading: "text-[#c43228]",
    };
  }

  if (tone === "warn") {
    return {
      icon: "text-[#d46b08]",
      heading: "text-[#d46b08]",
    };
  }

  return {
    icon: "text-[#1f6fd8]",
    heading: "text-[#1f6fd8]",
  };
}

function toneIcon(tone: RowTone) {
  if (tone === "good") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4.8 10.3l3.3 3.1 7-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (tone === "critical") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9">
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6.6v4.8M10 13.9h.01" strokeLinecap="round" />
      </svg>
    );
  }

  if (tone === "warn") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M10 4.6l5.8 10.1H4.2L10 4.6z" strokeLinejoin="round" />
        <path d="M10 8.3v3.8M10 14.1h.01" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 8.2v4.2M10 6.1h.01" strokeLinecap="round" />
    </svg>
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function countWords(value: string): number {
  if (!value.trim()) return 0;
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function rangeHeading(
  current: number,
  minimum: number,
  maximum: number,
  unitLabel: string,
): { heading: string; tone: RowTone } {
  if (current < minimum) {
    const low = minimum - current;
    const high = Math.max(low, maximum - current);
    return {
      heading: `Add ${low}-${high} ${unitLabel}`,
      tone: "warn",
    };
  }

  if (current > maximum) {
    const low = current - maximum;
    const high = Math.max(low, current - minimum);
    return {
      heading: `Consider removing ${low}-${high} ${unitLabel}`,
      tone: "warn",
    };
  }

  return {
    heading: "No action required.",
    tone: "good",
  };
}

function buildSections(item: HistoryItem, audit: AuditResult | null): DetailSection[] {
  const score = audit?.overall_score ?? 0;
  const primaryKeyword = (audit?.keywords?.primary || item.keyword || "").trim();
  const secondaryKeywords = (audit?.keywords?.secondary || []).filter((entry) => entry.trim().length > 0);
  const contentGaps = audit?.content_gaps || [];

  const normalizedPrimary = primaryKeyword.toLowerCase();
  const title = audit?.title_tag?.current || "";
  const titleLength = title.length;
  const meta = audit?.meta_description?.options?.[0] || "";
  const metaLength = meta.length;

  const serpAvg = audit?.word_count?.serp_avg ?? 0;
  const serpTop = audit?.word_count?.serp_top ?? 0;
  const bodyWords = audit?.word_count?.yours ?? 0;
  const suggestedMinWords = serpAvg > 0 ? Math.max(1100, Math.round(serpAvg * 0.85)) : 1100;
  const suggestedMaxWords =
    serpTop > 0 ? Math.max(suggestedMinWords + 200, Math.round(serpTop * 1.2)) : 2500;

  const headingOutline = audit?.headings_plan?.outline || [];
  const h1Text = audit?.headings_plan?.recommended_h1 || "";
  const h1Count = h1Text ? 1 : 0;
  const h2toh6Count = headingOutline.length;
  const headingWords = headingOutline.reduce((sum, row) => sum + countWords(row.text), 0);
  const paragraphWords = Math.max(0, bodyWords - headingWords);
  const strongWordsEstimate = Math.max(0, Math.round(bodyWords * 0.03));

  const faqCount = audit?.faq_pack?.length || 0;
  const checklist = audit?.checklist || [];
  const internalLinkTask = checklist.find((row) => /internal\s*link/i.test(row.task));
  const imageTaskCount = checklist.filter((row) => /\b(img|image|alt)\b/i.test(row.task)).length;
  const imageCountEstimate = imageTaskCount;

  const scoreTone: RowTone = score >= 70 ? "good" : score >= 50 ? "warn" : "critical";
  const scoreHeading = score >= 70 ? "No action required." : "Your content score can be improved.";

  const termsTotal = Math.max(secondaryKeywords.length + contentGaps.length, 12);
  const termsAttention = clamp(contentGaps.length + Math.max(0, 6 - secondaryKeywords.length), 0, termsTotal);
  const termsAttentionRatio = termsTotal > 0 ? termsAttention / termsTotal : 0;
  const termsTone: RowTone =
    termsAttention === 0 ? "good" : termsAttentionRatio >= 0.5 ? "critical" : "warn";

  const exactTitleCount =
    normalizedPrimary && title.toLowerCase().includes(normalizedPrimary) ? 1 : 0;
  const exactH1Count =
    normalizedPrimary && h1Text.toLowerCase().includes(normalizedPrimary)
      ? 1
      : 0;
  const exactHeadingCount = normalizedPrimary
    ? headingOutline.filter((row) => row.text.toLowerCase().includes(normalizedPrimary)).length
    : 0;

  const secondaryKeywordLowers = secondaryKeywords.map((entry) => entry.toLowerCase());
  const partialHeadingCount = headingOutline.filter((row) =>
    secondaryKeywordLowers.some((keyword) => row.text.toLowerCase().includes(keyword)),
  ).length;
  const partialBodyDensity = bodyWords > 0 ? Number(((secondaryKeywords.length / bodyWords) * 100).toFixed(2)) : 0;
  const partialParagraphDensity =
    paragraphWords > 0
      ? Number((((secondaryKeywords.length - contentGaps.length) / paragraphWords) * 100).toFixed(2))
      : 0;

  const titleTone: RowTone = titleLength >= 55 && titleLength <= 70 ? "good" : "warn";
  const metaTone: RowTone = metaLength >= 130 && metaLength <= 160 ? "good" : "warn";

  const bodyRange = rangeHeading(bodyWords, suggestedMinWords, suggestedMaxWords, "words in body");
  const headingWordsMin = Math.max(90, Math.round(suggestedMinWords * 0.1));
  const headingWordsMax = Math.max(headingWordsMin + 70, Math.round(suggestedMaxWords * 0.13));
  const headingRange = rangeHeading(headingWords, headingWordsMin, headingWordsMax, "words in h2 to h6");

  const paragraphWordsMin = Math.max(700, Math.round(suggestedMinWords * 0.72));
  const paragraphWordsMax = Math.max(paragraphWordsMin + 300, Math.round(suggestedMaxWords * 0.86));
  const paragraphRange = rangeHeading(
    paragraphWords,
    paragraphWordsMin,
    paragraphWordsMax,
    "words in paragraphs",
  );

  const strongWordsMin = Math.max(10, Math.round(suggestedMinWords * 0.01));
  const strongWordsMax = Math.max(strongWordsMin + 10, Math.round(suggestedMaxWords * 0.024));
  const strongRange = rangeHeading(
    strongWordsEstimate,
    strongWordsMin,
    strongWordsMax,
    "words from strong, b",
  );

  const headingElementMin = Math.max(8, Math.round(suggestedMinWords / 42));
  const headingElementMax = Math.max(headingElementMin + 20, Math.round(suggestedMaxWords / 30));
  const headingElementRange = rangeHeading(
    h2toh6Count,
    headingElementMin,
    headingElementMax,
    "h2 to h6 elements",
  );

  const paragraphElementMin = Math.max(12, Math.round(suggestedMinWords / 90));
  const paragraphElementTone: RowTone = paragraphWords >= paragraphWordsMin ? "good" : "warn";

  const imageElementMin = Math.max(2, Math.round(suggestedMinWords / 120));
  const imageElementMax = Math.max(imageElementMin + 8, Math.round(suggestedMaxWords / 75));
  const imageElementRange = rangeHeading(
    imageCountEstimate,
    imageElementMin,
    imageElementMax,
    "image elements",
  );

  return [
    {
      id: "content-score",
      title: "Content Score",
      rows: [
        {
          id: "content-score-main",
          tone: scoreTone,
          heading: scoreHeading,
          metric: `Your Content Score is ${score}.`,
          description:
            score >= 70
              ? "This page is currently in a healthy range."
              : "Implement the highest-impact recommendations to improve ranking readiness.",
          details:
            "Content Score combines keyword relevance, structure, topical coverage, and optimization completeness.",
        },
      ],
    },
    {
      id: "internal-links",
      title: "Internal Links",
      rows: [
        {
          id: "internal-links-main",
          tone: internalLinkTask ? "warn" : "info",
          heading: internalLinkTask ? "Add targeted internal links for this topic." : "No action required.",
          metric: internalLinkTask
            ? internalLinkTask.task
            : "We have not found internal linking opportunities with this keyword.",
          description: internalLinkTask
            ? "Link from nearby intent pages and service pages using natural anchors."
            : "Link opportunities will appear once relevant in-site targets are detected.",
          details:
            "Add links from related service pages, guides, and FAQs using natural anchor text tied to this topic.",
        },
      ],
    },
    {
      id: "terms",
      title: "Terms to Use",
      rows: [
        {
          id: "terms-main",
          tone: termsTone,
          heading:
            termsAttention > 0
              ? "Review important terms and apply suggestions where they make sense."
              : "No action required.",
          metric: `${termsAttention} out of ${termsTotal} important terms need attention.`,
          description:
            contentGaps.length > 0
              ? `Top gaps: ${contentGaps.slice(0, 3).join(", ")}${contentGaps.length > 3 ? "..." : ""}`
              : "Topical term coverage is balanced.",
          details:
            "Prioritize terms that fit naturally in H2/H3 headings and intro paragraphs. Avoid stuffing the same term repeatedly.",
        },
      ],
    },
    {
      id: "word-count",
      title: "Word Count",
      rows: [
        {
          id: "word-count-body",
          tone: bodyRange.tone,
          heading: bodyRange.heading,
          metric: `${bodyWords} words in body`,
          description: `Your page has ${bodyWords} words in body, while the suggested range is ${suggestedMinWords}-${suggestedMaxWords} words.`,
          details:
            audit?.word_count?.recommendation ||
            "Expand helpful sections and FAQs with concrete, non-repetitive details until body length reaches the suggested range.",
        },
        {
          id: "word-count-headings",
          tone: headingRange.tone,
          heading: headingRange.heading,
          metric: `${headingWords} words in h2 to h6`,
          description: `Your page has ${headingWords} heading words, while the suggested range is ${headingWordsMin}-${headingWordsMax} words.`,
          details:
            "Increase heading depth with concise, intent-aligned subtopics so scanners and answer engines can parse sections quickly.",
        },
        {
          id: "word-count-paragraphs",
          tone: paragraphRange.tone,
          heading: paragraphRange.heading,
          metric: `${paragraphWords} words in paragraphs`,
          description: `Your page has ${paragraphWords} paragraph words, while the suggested range is ${paragraphWordsMin}-${paragraphWordsMax} words.`,
          details:
            "Paragraph content should carry most of your topical depth. Add specific proof points, examples, and concise answers.",
        },
        {
          id: "word-count-strong",
          tone: strongRange.tone,
          heading: strongRange.heading,
          metric: `${strongWordsEstimate} words in strong, b`,
          description: `Estimated emphasized words are ${strongWordsEstimate}; suggested range is ${strongWordsMin}-${strongWordsMax}.`,
          details:
            "Reserve emphasis for high-intent phrases and key facts. Overusing bold text weakens scanability and perceived quality.",
        },
      ],
    },
    {
      id: "exact-keywords",
      title: "Exact Keywords",
      rows: [
        {
          id: "exact-title",
          tone: exactTitleCount === 1 ? "good" : "warn",
          heading: exactTitleCount === 1 ? "No action required." : "Add the exact keyword to the title.",
          metric: `${exactTitleCount} exact keyword in title`,
          description:
            exactTitleCount === 1
              ? "Title already includes the primary keyword."
              : "Include the primary keyword once in title, preferably near the start.",
          details:
            "Keep the title natural and concise while preserving brand language; avoid repeating the same phrase.",
        },
        {
          id: "exact-body",
          tone: "info",
          heading: "Compared pages vary widely in body exact-match density.",
          metric: "Body exact keyword density is not directly measured in this run.",
          description:
            "Use the exact keyword naturally in core body copy, then prioritize semantic coverage over repetition.",
          details:
            "When you need higher exact-match usage, spread it across intro, key section headings, and one FAQ answer instead of clustering.",
        },
        {
          id: "exact-h1",
          tone: exactH1Count === 1 ? "good" : "warn",
          heading: exactH1Count === 1 ? "No action required." : "Add the exact keyword to H1.",
          metric: `${exactH1Count} exact keyword in h1`,
          description:
            exactH1Count === 1
              ? "H1 already includes the exact primary keyword."
              : "Use the exact primary keyword once in H1 for stronger topical clarity.",
          details:
            "Use exactly one H1. Keep it human, readable, and aligned with page intent.",
        },
        {
          id: "exact-headings",
          tone: exactHeadingCount > 0 ? "good" : "warn",
          heading:
            exactHeadingCount > 0
              ? "No action required."
              : "Add an exact keyword match to at least one h2 to h6 heading.",
          metric: `${exactHeadingCount} exact keywords in h2 to h6`,
          description:
            "Headings with exact matches help retrieval systems map topical relevance quickly.",
          details:
            "Include one exact match in a high-priority section heading and keep the rest of headings semantically varied.",
        },
        {
          id: "exact-paragraphs",
          tone: "info",
          heading: "Paragraph exact-match density is not directly measured.",
          metric: "Use contextual checks in the editor for paragraph-level exact usage.",
          description:
            "You can still optimize this manually by adding one exact match to the opening section and one in a supporting section.",
          details:
            "Avoid forcing exact terms into every paragraph; prioritize readability and intent coverage over raw density.",
        },
        {
          id: "exact-image-alt",
          tone: "info",
          heading: "Image alt exact usage is not available in this payload.",
          metric: "No exact-keyword image-alt metric for this run.",
          description: "If images are present, add concise descriptive alt text and include the exact keyword only where relevant.",
          details:
            "Good alt text should describe the image first. Use keyword terms only when they fit the image context naturally.",
        },
      ],
    },
    {
      id: "partial-keywords",
      title: "Partial Keywords",
      rows: [
        {
          id: "partial-body",
          tone: partialBodyDensity >= 1.2 ? "good" : "warn",
          heading:
            partialBodyDensity >= 1.2
              ? "No action required."
              : "Add more partial keywords per 100 words in body.",
          metric: `${partialBodyDensity} partial keywords per 100 words in body`,
          description:
            secondaryKeywords.length > 0
              ? `${secondaryKeywords.length} semantic variants currently tracked.`
              : "No semantic variants found in the audit payload.",
          details:
            "Use close variants in supporting headings and answers to improve relevance across broader search intents.",
        },
        {
          id: "partial-headings",
          tone: partialHeadingCount >= 2 ? "good" : "warn",
          heading:
            partialHeadingCount >= 2
              ? "No action required."
              : "Add more semantic variants in h2 to h6 headings.",
          metric: `${partialHeadingCount} partial keywords in h2 to h6`,
          description:
            "Headings should carry different semantic variants so each section maps to a slightly different search intent.",
          details:
            "Use variant terms in h2 and keep h3 specific. This helps answer engines extract and match sections accurately.",
        },
        {
          id: "partial-paragraphs",
          tone: partialParagraphDensity >= 1 ? "good" : "warn",
          heading:
            partialParagraphDensity >= 1
              ? "No action required."
              : "Add more partial keyword usage in paragraphs.",
          metric: `${Math.max(0, partialParagraphDensity)} partial keywords per 100 words in paragraphs`,
          description:
            "Paragraphs are where semantic breadth should be strongest. Use natural phrasing tied to real user questions.",
          details:
            "Expand contextual terms around benefits, steps, costs, timelines, and location/service modifiers where relevant.",
        },
        {
          id: "partial-image-alt",
          tone: "info",
          heading: "Image-alt partial keyword coverage is not available in this run.",
          metric: "No partial-keyword image-alt metric for this payload.",
          description:
            "If this page includes images, use descriptive alt text and include semantic variants only where they fit.",
          details:
            "Alt text helps accessibility first. Treat keyword usage as secondary and only include it when it accurately describes the image.",
        },
      ],
    },
    {
      id: "page-structure",
      title: "Page Structure",
      rows: [
        {
          id: "structure-h1",
          tone: h1Count === 1 ? "good" : "warn",
          heading: h1Count === 1 ? "No action required." : "Use exactly one h1 element.",
          metric: `${h1Count} h1 element`,
          description:
            "Regardless of competition, one clear h1 with the exact topic keeps the page hierarchy consistent.",
          details: "Keep only one h1 and place the primary keyword naturally in it.",
        },
        {
          id: "structure-headings",
          tone: headingElementRange.tone,
          heading: headingElementRange.heading,
          metric: `${h2toh6Count} h2 to h6 elements`,
          description:
            `Your page has ${h2toh6Count} heading elements, while the suggested range is ${headingElementMin}-${headingElementMax}.`,
          details:
            "Use a clear hierarchy: one H1, then logical H2 groups with concise H3 subtopics as needed.",
        },
        {
          id: "structure-paragraphs",
          tone: paragraphElementTone,
          heading: paragraphElementTone === "good" ? "No action required." : "Add more paragraph elements.",
          metric: `${Math.max(1, Math.round(paragraphWords / 80))} paragraph elements (estimated)`,
          description:
            `Estimated paragraph count should be at least ${paragraphElementMin} for this content range.`,
          details:
            "Break long blocks into shorter paragraphs so the page is easier to scan and easier for AI systems to segment.",
        },
        {
          id: "structure-images",
          tone: imageElementRange.tone,
          heading: imageElementRange.heading,
          metric: `${imageCountEstimate} image elements`,
          description: `Suggested image range is ${imageElementMin}-${imageElementMax} based on current word targets.`,
          details:
            "Add supportive visuals where they clarify process, outcomes, or product details. Keep alt text descriptive and specific.",
        },
        {
          id: "structure-faq",
          tone: faqCount >= 1 ? "good" : "info",
          heading: faqCount >= 1 ? "No action required." : "Consider adding an FAQ block.",
          metric: `${faqCount} FAQ entries`,
          description:
            faqCount >= 1
              ? "FAQ intent is represented in the current recommendations."
              : "Adding FAQ improves answer-engine readiness and long-tail query coverage.",
          details:
            "Use short query-style questions and direct answers (40-70 words) for better GEO/AEO performance.",
        },
      ],
    },
    {
      id: "title-meta",
      title: "Title and meta description length",
      rows: [
        {
          id: "title-length",
          tone: titleTone,
          heading:
            titleTone === "good"
              ? "No action required."
              : "Adjust title length to 55-70 characters.",
          metric: `${titleLength} characters in title`,
          description: `Current title length is ${titleLength}; optimal range is 55-70 characters.`,
          details:
            "Keep one clear value proposition and include the primary keyword naturally once.",
        },
        {
          id: "meta-length",
          tone: metaTone,
          heading:
            metaTone === "good"
              ? "No action required."
              : "Adjust meta description length to 130-160 characters.",
          metric: `${metaLength} characters in meta description`,
          description: `Current meta description length is ${metaLength}; optimal range is 130-160 characters.`,
          details:
            "Use one direct benefit + one clear CTA, while keeping language natural and specific.",
        },
      ],
    },
    {
      id: "ttfb",
      title: "Time to first byte",
      rows: [
        {
          id: "ttfb-main",
          tone: "info",
          heading: "Metric unavailable in this run.",
          metric: "No TTFB telemetry was returned by the current audit payload.",
          description: "Once backend timing telemetry is enabled, this section will apply action thresholds automatically.",
          details:
            "Recommended target is typically below 200ms for fast-response pages, depending on infrastructure and geography.",
        },
      ],
    },
    {
      id: "load-time",
      title: "Load time (ms)",
      rows: [
        {
          id: "load-time-main",
          tone: "info",
          heading: "Metric unavailable in this run.",
          metric: "No page-load timing metric was returned by this audit payload.",
          description:
            "When load metrics are available, this section will flag slow pages and prioritize content and render optimizations.",
          details:
            "Keep render-critical assets minimal, optimize image sizes, and defer non-essential scripts to improve user-perceived speed.",
        },
      ],
    },
  ];
}

export function JobDetailPanel({
  item,
  loadingAudit = false,
  onClose,
  onRetryScan,
  onOptimizeJob,
  onOpenEditor,
  retryScanJobId,
  optimizingJobId,
}: Props) {
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const audit = parseAuditResult(item.audit_result);
  const hasStructuredAudit = !!audit && !audit.parse_error;
  const sections: DetailSection[] = hasStructuredAudit
    ? buildSections(item, audit)
    : [
        {
          id: "audit-unavailable",
          title: loadingAudit ? "Loading audit details" : "Audit details unavailable",
          rows: [
            {
              id: "audit-unavailable-main",
              tone: loadingAudit ? "info" : "warn",
              heading: loadingAudit
                ? "Fetching full audit payload."
                : "No structured audit payload was found for this run.",
              metric: loadingAudit
                ? "Please wait while we load complete audit metrics."
                : "Run scan again if this job completed without audit metrics.",
              description: loadingAudit
                ? "The summary list uses lightweight history rows. Details load the full payload on demand."
                : "This can happen when an audit failed, parsed incorrectly, or finished without structured output.",
              details:
                "Once a complete audit payload is available, all score and recommendation sections will render with live values.",
            },
          ],
        },
      ];

  const retryScanLoading = retryScanJobId === item.id;
  const optimizeLoading = optimizingJobId === item.id;
  const isBusy = item.status === "pending" || item.status === "running";
  const hasEditorArtifacts = item.has_source_html || item.has_export;
  const editorDisabled = isBusy || !hasEditorArtifacts;
  const editorDisabledTitle = isBusy
    ? "Editor opens when scan status is no longer pending/running."
    : !hasEditorArtifacts
      ? "No HTML artifacts yet. Run scan or optimize first."
      : undefined;

  function toggleRow(rowId: string) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(item?.url || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  const breadcrumbLabel = item.keyword?.trim() || "Audit";

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-white">
      <header className="sticky top-0 z-10 border-b border-[#eceef5] bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-4">
          <div className="min-w-0 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#dde1eb] text-[#2e3348] hover:bg-[#f6f8fc]"
              aria-label="Back"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12.7 4.7L7.4 10l5.3 5.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <div className="min-w-0">
              <p className="truncate text-[14px] text-[#6a7082]">
                Audit / <span className="font-semibold text-[#22273a]">{breadcrumbLabel}</span>
              </p>
              <p className="truncate text-[14px] text-[#2f3549]">{item.url}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOptimizeJob(item.id)}
              disabled={optimizeLoading || item.status === "pending" || item.status === "running"}
              className="inline-flex h-9 items-center rounded-lg border border-[#dde1eb] px-3 text-[13px] text-[#2d3245] hover:bg-[#f6f8fc] disabled:opacity-45"
            >
              {optimizeLoading ? "Optimizing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex h-9 items-center rounded-lg bg-[#121420] px-4 text-[13px] font-semibold text-white hover:bg-[#24283c]"
            >
              {copied ? "Copied" : "Share"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-6">
        <section className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onRetryScan(item)}
            disabled={retryScanLoading || item.status === "pending" || item.status === "running"}
            className="inline-flex h-9 items-center rounded-lg border border-[#dde1eb] px-3 text-[13px] text-[#2d3245] hover:bg-[#f6f8fc] disabled:opacity-45"
          >
            {retryScanLoading ? "Retrying..." : "Retry scan"}
          </button>
          <button
            type="button"
            onClick={() => onOpenEditor(item.id)}
            disabled={editorDisabled}
            className="inline-flex h-9 items-center rounded-lg border border-[#dde1eb] px-3 text-[13px] text-[#2d3245] hover:bg-[#f6f8fc] disabled:opacity-45"
            title={editorDisabledTitle}
          >
            Open editor
          </button>
          {item.has_source_html && (
            <a
              href={getSourceExportUrl(item.id)}
              download
              className="inline-flex h-9 items-center rounded-lg border border-[#dde1eb] px-3 text-[13px] text-[#2d3245] hover:bg-[#f6f8fc]"
            >
              Source
            </a>
          )}
          {item.has_export && (
            <a
              href={getExportUrl(item.id)}
              download
              className="inline-flex h-9 items-center rounded-lg border border-[#dde1eb] px-3 text-[13px] text-[#2d3245] hover:bg-[#f6f8fc]"
            >
              Export
            </a>
          )}
          {statusChip(item.status)}
          <p className="text-[12px] text-[#7a8092]">
            Job #{item.id} • {item.pipeline_mode || "full"} • Created {formatDateTimeWithTimezone(item.created_at)}
          </p>
        </section>

        {item.error_message && (
          <section className="rounded-2xl border border-[#f4c8c8] bg-[#fff4f4] px-5 py-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#b42318]">Latest Error</p>
            <p className="mt-1 text-[14px] text-[#b42318]">
              {item.error_stage || "pipeline"} ({item.error_code || "unknown"}): {item.error_message}
            </p>
          </section>
        )}

        {sections.map((section) => (
          <section key={section.id} className="border-b border-[#eceff6] pb-5 last:border-b-0">
            <h2 className="text-[19px] leading-tight font-semibold text-[#1f2435]">{section.title}</h2>

            <div className="mt-2 divide-y divide-[#eceff6]">
              {section.rows.map((row) => {
                const styles = toneStyles(row.tone);
                const isOpen = openRows.has(row.id);

                return (
                  <div key={row.id} className="py-3 first:pt-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center ${styles.icon}`}>
                            {toneIcon(row.tone)}
                          </span>
                          <div className="min-w-0">
                            <p className={`text-[16px] font-medium ${styles.heading}`}>{row.heading}</p>
                            <p className="mt-0.5 text-[14px] text-[#1f2538]">{row.metric}</p>
                            <p className="mt-0.5 text-[13px] text-[#5f667b]">{row.description}</p>
                            {isOpen && (
                              <p className="mt-1 text-[13px] text-[#4a5268]">{row.details}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleRow(row.id)}
                        className="shrink-0 text-[13px] font-semibold text-[#4a5268] underline underline-offset-2 hover:text-[#1f2435]"
                      >
                        {isOpen ? "Hide details" : "Show details"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
