"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  getEditorDocument,
  getExportUrl,
  getSourceExportUrl,
  getHistoryItem,
  optimizeExistingJob,
  saveEditorDocument,
} from "@/lib/apiClient";
import type { AuditResult, EditorDocument, HistoryItem } from "@/types";

interface Props {
  jobId: number | null;
  initialVersion?: "source" | "optimized";
  contextItem?: HistoryItem | null;
  mode?: "modal" | "page";
  onClose: () => void;
}

interface HtmlTemplate {
  prefix: string;
  suffix: string;
}

type SignalStatus = "pass" | "warn" | "fail";
type TermStatus = "low" | "good" | "high";
type SideTab = "guidelines" | "facts" | "outline";

interface SeoSignal {
  key: string;
  label: string;
  status: SignalStatus;
  score: number;
  maxScore: number;
  detail: string;
  recommendation: string;
}

interface EditorStats {
  textContent: string;
  wordCount: number;
  headingCount: number;
  paragraphCount: number;
  faqCount: number;
  ctaCount: number;
  imageCount: number;
}

interface TermSignal {
  term: string;
  count: number;
  min: number;
  max: number;
  status: TermStatus;
}

interface ToolbarButtonProps {
  label: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}

function ToolbarButton({ label, title, onClick, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-md border border-[#e4e5ee] bg-white text-[11px] font-semibold text-[#484b60] hover:border-[#cccedc] hover:bg-[#fafbff] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {label}
    </button>
  );
}

function parseAudit(auditResult: string | null | undefined): AuditResult | null {
  if (!auditResult) return null;
  try {
    return JSON.parse(auditResult) as AuditResult;
  } catch {
    return null;
  }
}

function splitHtmlDocument(rawHtml: string): { template: HtmlTemplate; editableHtml: string } {
  const openMatch = /<body[^>]*>/i.exec(rawHtml);
  if (!openMatch || openMatch.index === undefined) {
    return { template: { prefix: "", suffix: "" }, editableHtml: rawHtml };
  }

  const openEnd = openMatch.index + openMatch[0].length;
  const closeMatch = /<\/body>/i.exec(rawHtml.slice(openEnd));
  if (!closeMatch || closeMatch.index === undefined) {
    return { template: { prefix: "", suffix: "" }, editableHtml: rawHtml };
  }

  const closeStart = openEnd + closeMatch.index;
  return {
    template: {
      prefix: rawHtml.slice(0, openEnd),
      suffix: rawHtml.slice(closeStart),
    },
    editableHtml: rawHtml.slice(openEnd, closeStart),
  };
}

function mergeHtmlDocument(template: HtmlTemplate, editableHtml: string): string {
  if (!template.prefix && !template.suffix) return editableHtml;
  return `${template.prefix}${editableHtml}${template.suffix}`;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function linkTextLength(root: ParentNode): number {
  return Array.from(root.querySelectorAll("a"))
    .map((node) => normalizeText(node.textContent || "").length)
    .reduce((sum, value) => sum + value, 0);
}

function stripPageChrome(editableHtml: string): string {
  if (!editableHtml.trim() || typeof DOMParser === "undefined") {
    return editableHtml;
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<!doctype html><html><body>${editableHtml}</body></html>`, "text/html");
  const body = parsed.body;

  body.querySelectorAll("script,style,noscript,template,iframe").forEach((node) => node.remove());

  const hardRemove =
    "header,nav,footer,aside,[role='navigation'],[role='banner'],[role='contentinfo']," +
    ".breadcrumb,.breadcrumbs,.site-header,.site-footer,.top-nav,.main-nav,.footer-links,.toc,.table-of-contents";
  body.querySelectorAll(hardRemove).forEach((node) => node.remove());

  const chromePattern = /(^|[-_])(nav|menu|footer|header|breadcrumb|cookie|sidebar|social|newsletter)([-_]|$)/i;
  body.querySelectorAll<HTMLElement>("[class],[id]").forEach((node) => {
    const classValue = node.getAttribute("class") || "";
    const idValue = node.getAttribute("id") || "";
    if (chromePattern.test(classValue) || chromePattern.test(idValue)) {
      node.remove();
    }
  });

  let contentRoot =
    body.querySelector<HTMLElement>(
      "main,article,[role='main'],#main,#content,.main-content,.content-area,.post-content,.entry-content",
    ) || null;

  if (!contentRoot) {
    let best: HTMLElement | null = null;
    let bestScore = 0;

    body.querySelectorAll<HTMLElement>("article,main,section,div").forEach((node) => {
      const text = normalizeText(node.textContent || "");
      if (text.length < 240) return;

      const paragraphCount = node.querySelectorAll("p").length;
      const linkDensity = text.length > 0 ? linkTextLength(node) / text.length : 0;
      const score = text.length + paragraphCount * 220 - linkDensity * 1200;

      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    });

    contentRoot = best || body;
  }

  const clone = contentRoot.cloneNode(true) as HTMLElement;

  const attributePattern = /(menu|nav|footer|header|sidebar|breadcrumb|share|social|related|newsletter|subscribe|cookie|legal|sitemap|toc)/i;
  clone.querySelectorAll<HTMLElement>("[class],[id],[role],[aria-label]").forEach((node) => {
    const classValue = node.getAttribute("class") || "";
    const idValue = node.getAttribute("id") || "";
    const roleValue = node.getAttribute("role") || "";
    const labelValue = node.getAttribute("aria-label") || "";
    const marker = `${classValue} ${idValue} ${roleValue} ${labelValue}`;
    if (attributePattern.test(marker)) {
      node.remove();
    }
  });

  clone
    .querySelectorAll<HTMLElement>("nav,header,footer,aside,ul,ol,section,div")
    .forEach((node) => {
      const text = normalizeText(node.textContent || "");
      if (!text) return;

      const paragraphs = node.querySelectorAll("p").length;
      const headings = node.querySelectorAll("h1,h2,h3,h4,h5,h6").length;
      const links = node.querySelectorAll("a").length;
      const ratio = text.length > 0 ? linkTextLength(node) / text.length : 0;
      const linkHeavy = (links >= 4 && ratio > 0.45) || (links >= 7 && text.length < 420);
      const weakContent = paragraphs === 0 && headings === 0 && links >= 3;
      if (linkHeavy || weakContent) {
        node.remove();
      }
    });

  clone.querySelectorAll<HTMLElement>("p,div,section,article").forEach((node) => {
    const text = normalizeText(node.textContent || "");
    if (!text && !node.querySelector("img,video,iframe")) {
      node.remove();
    }
  });

  const result = clone.innerHTML.trim();
  if (result) return result;

  const fallbackText = normalizeText(clone.textContent || "");
  return fallbackText ? `<p>${fallbackText}</p>` : "<p></p>";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("\n", " ");
}

function decodeEntities(value: string): string {
  if (!value) return "";
  if (typeof document === "undefined") return value;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function extractHeadMeta(rawHtml: string): { title: string; description: string } {
  const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities(normalizeText(titleMatch?.[1] || ""));

  const descriptionMatch =
    rawHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
    rawHtml.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);

  const description = decodeEntities(normalizeText(descriptionMatch?.[1] || ""));
  return { title, description };
}

function upsertTitle(rawHtml: string, title: string): string {
  const nextTitle = normalizeText(title);
  if (!nextTitle) return rawHtml;
  const safeTitle = escapeHtml(nextTitle);

  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(rawHtml)) {
    return rawHtml.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  }

  if (/<\/head>/i.test(rawHtml)) {
    return rawHtml.replace(/<\/head>/i, `  <title>${safeTitle}</title>\n</head>`);
  }

  return rawHtml;
}

function upsertMetaDescription(rawHtml: string, description: string): string {
  const nextDescription = normalizeText(description);
  if (!nextDescription) return rawHtml;
  const safeDescription = escapeAttribute(nextDescription);
  const tag = `<meta name="description" content="${safeDescription}">`;

  const hasDescriptionMeta =
    /<meta[^>]*name=["']description["'][^>]*>/i.test(rawHtml) ||
    /<meta[^>]*content=["'][^"']*["'][^>]*name=["']description["'][^>]*>/i.test(rawHtml);

  if (hasDescriptionMeta) {
    return rawHtml
      .replace(/<meta[^>]*name=["']description["'][^>]*>/i, tag)
      .replace(/<meta[^>]*content=["'][^"']*["'][^>]*name=["']description["'][^>]*>/i, tag);
  }

  if (/<\/head>/i.test(rawHtml)) {
    return rawHtml.replace(/<\/head>/i, `  ${tag}\n</head>`);
  }

  return rawHtml;
}

function applyHeadMeta(rawHtml: string, title: string, description: string): string {
  let next = rawHtml;
  next = upsertTitle(next, title);
  next = upsertMetaDescription(next, description);
  return next;
}

function stripHtml(html: string): string {
  if (!html) return "";

  if (typeof DOMParser === "undefined") {
    return normalizeText(html.replace(/<[^>]*>/g, " "));
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");
  return normalizeText(parsed.body.textContent || "");
}

function collectEditorStats(html: string): EditorStats {
  if (!html.trim()) {
    return {
      textContent: "",
      wordCount: 0,
      headingCount: 0,
      paragraphCount: 0,
      faqCount: 0,
      ctaCount: 0,
      imageCount: 0,
    };
  }

  if (typeof DOMParser === "undefined") {
    const textContent = stripHtml(html);
    return {
      textContent,
      wordCount: textContent ? textContent.split(/\s+/).filter(Boolean).length : 0,
      headingCount: 0,
      paragraphCount: 0,
      faqCount: 0,
      ctaCount: 0,
      imageCount: 0,
    };
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");

  const textContent = normalizeText(parsed.body.textContent || "");
  const headingCount = parsed.body.querySelectorAll("h1,h2,h3,h4,h5,h6").length;
  const paragraphCount = Array.from(parsed.body.querySelectorAll("p")).filter(
    (node) => normalizeText(node.textContent || "").length > 0,
  ).length;

  let faqCount = parsed.body.querySelectorAll("section.faq-item,[data-faq-item='true']").length;
  if (faqCount === 0) {
    faqCount = Array.from(parsed.body.querySelectorAll("h2,h3,h4")).filter((node) =>
      (node.textContent || "").includes("?"),
    ).length;
  }

  const ctaCount = Array.from(parsed.body.querySelectorAll("a[href]")).filter(
    (node) => normalizeText(node.textContent || "").length > 0,
  ).length;

  const imageCount = parsed.body.querySelectorAll("img").length;

  return {
    textContent,
    wordCount: textContent ? textContent.split(/\s+/).filter(Boolean).length : 0,
    headingCount,
    paragraphCount,
    faqCount,
    ctaCount,
    imageCount,
  };
}

function countKeyword(text: string, keyword: string): number {
  const target = keyword.trim().toLowerCase();
  if (!target) return 0;

  const source = text.toLowerCase();
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = source.match(new RegExp(`\\b${escaped}\\b`, "g"));
  return matches ? matches.length : 0;
}

function clampScore(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function statusTone(status: SignalStatus): { badge: string; text: string } {
  if (status === "pass") {
    return {
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
      text: "text-emerald-700",
    };
  }

  if (status === "warn") {
    return {
      badge: "bg-amber-50 text-amber-700 border-amber-200",
      text: "text-amber-700",
    };
  }

  return {
    badge: "bg-red-50 text-red-700 border-red-200",
    text: "text-red-700",
  };
}

function termTone(status: TermStatus): string {
  if (status === "good") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "high") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-red-50 text-red-700 border-red-200";
}

function metricTone(status: TermStatus): string {
  if (status === "good") return "text-emerald-600";
  if (status === "high") return "text-amber-600";
  return "text-red-600";
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Strong";
  if (score >= 65) return "Good";
  if (score >= 45) return "Needs Work";
  return "Critical";
}

function classifyRange(value: number, min: number, max: number): TermStatus {
  if (value < min) return "low";
  if (value > max) return "high";
  return "good";
}

const AUTO_OPTIMIZE_POLL_MS = 2000;
const AUTO_OPTIMIZE_MAX_POLLS = 90;

function prepareEditorSeed(input: {
  rawHtml: string;
  fallbackTitle: string;
  fallbackDescription: string;
}): {
  template: HtmlTemplate;
  seededHtml: string;
  metaTitle: string;
  metaDescription: string;
} {
  const split = splitHtmlDocument(input.rawHtml);
  const cleaned = stripPageChrome(split.editableHtml);
  const cleanedText = stripHtml(cleaned);
  const originalText = stripHtml(split.editableHtml);
  const cleanedKeepsEnoughContent =
    cleanedText.length > 0 &&
    (originalText.length === 0 ||
      cleanedText.length >= Math.min(200, Math.floor(originalText.length * 0.2)));
  const seededBase = cleanedKeepsEnoughContent
    ? cleaned.trim()
    : split.editableHtml.trim();
  const seeded = seededBase ? seededBase : "<p></p>";
  const meta = extractHeadMeta(input.rawHtml);

  return {
    template: split.template,
    seededHtml: seeded,
    metaTitle: meta.title || input.fallbackTitle,
    metaDescription: meta.description || input.fallbackDescription,
  };
}

export function HtmlEditorPanel({
  jobId,
  initialVersion = "optimized",
  contextItem,
  mode = "modal",
  onClose,
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  const [doc, setDoc] = useState<EditorDocument | null>(null);
  const [template, setTemplate] = useState<HtmlTemplate>({ prefix: "", suffix: "" });
  const [editorHtml, setEditorHtml] = useState("");
  const [editorSeed, setEditorSeed] = useState(0);

  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");

  const [sideTab, setSideTab] = useState<SideTab>("guidelines");
  const [termQuery, setTermQuery] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoOptimizing, setAutoOptimizing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const audit = useMemo(() => parseAudit(contextItem?.audit_result), [contextItem?.audit_result]);

  const stats = useMemo(() => collectEditorStats(editorHtml), [editorHtml]);

  const targetWords = useMemo(() => {
    const fromAudit = audit?.word_count?.serp_avg;
    if (typeof fromAudit === "number" && fromAudit > 0) return fromAudit;
    return 800;
  }, [audit?.word_count?.serp_avg]);

  const primaryKeyword = useMemo(
    () => contextItem?.keyword?.trim() || audit?.keywords?.primary?.trim() || "",
    [contextItem?.keyword, audit?.keywords?.primary],
  );

  const secondaryKeywords = useMemo(() => {
    const values = new Set<string>();
    (audit?.keywords?.secondary || []).forEach((keyword) => {
      const normalized = normalizeText(keyword);
      if (normalized) values.add(normalized);
    });
    return Array.from(values);
  }, [audit?.keywords?.secondary]);

  const primaryCount = useMemo(
    () => countKeyword(stats.textContent, primaryKeyword),
    [stats.textContent, primaryKeyword],
  );

  const primaryDensity = useMemo(() => {
    if (!stats.wordCount || !primaryCount) return 0;
    return (primaryCount / stats.wordCount) * 100;
  }, [stats.wordCount, primaryCount]);

  const secondaryKeywordStats = useMemo(
    () =>
      secondaryKeywords.map((keyword) => ({
        keyword,
        count: countKeyword(stats.textContent, keyword),
      })),
    [secondaryKeywords, stats.textContent],
  );

  const coveredSecondaryCount = useMemo(
    () => secondaryKeywordStats.filter((entry) => entry.count > 0).length,
    [secondaryKeywordStats],
  );

  const headingTarget = useMemo(() => {
    if (stats.wordCount >= 1400) return { min: 6, max: 10 };
    if (stats.wordCount >= 900) return { min: 4, max: 8 };
    return { min: 3, max: 6 };
  }, [stats.wordCount]);

  const paragraphTarget = useMemo(() => {
    const min = Math.max(4, Math.round(targetWords / 110));
    const max = Math.max(min + 2, Math.round(targetWords / 70));
    return { min, max };
  }, [targetWords]);

  const imageTarget = useMemo(() => {
    const min = Math.max(1, Math.round(targetWords / 900));
    const max = Math.max(min, Math.round(targetWords / 350));
    return { min, max };
  }, [targetWords]);

  const seoSignals = useMemo<SeoSignal[]>(() => {
    const signals: SeoSignal[] = [];

    const wordsRatio = targetWords > 0 ? stats.wordCount / targetWords : 0;
    let contentStatus: SignalStatus = "fail";
    let contentScore = 0;
    if (wordsRatio >= 0.85 && wordsRatio <= 1.2) {
      contentStatus = "pass";
      contentScore = 22;
    } else if (wordsRatio >= 0.65 && wordsRatio <= 1.4) {
      contentStatus = "warn";
      contentScore = 12;
    }

    signals.push({
      key: "word-count",
      label: "Content length",
      status: contentStatus,
      score: contentScore,
      maxScore: 22,
      detail: `${stats.wordCount} words vs ${targetWords} target`,
      recommendation:
        contentStatus === "pass"
          ? "Length is aligned with benchmark."
          : "Adjust body length closer to benchmark.",
    });

    let primaryStatus: SignalStatus = "pass";
    let primaryScore = 18;
    if (!primaryKeyword) {
      primaryStatus = "warn";
      primaryScore = 8;
    } else if (primaryCount === 0) {
      primaryStatus = "fail";
      primaryScore = 0;
    } else if (primaryCount < 2) {
      primaryStatus = "warn";
      primaryScore = 10;
    }

    signals.push({
      key: "primary-keyword",
      label: "Primary keyword presence",
      status: primaryStatus,
      score: primaryScore,
      maxScore: 18,
      detail: primaryKeyword
        ? `\"${primaryKeyword}\" used ${primaryCount} time${primaryCount === 1 ? "" : "s"}`
        : "No primary keyword selected",
      recommendation:
        primaryStatus === "pass"
          ? "Primary keyword usage is healthy."
          : "Add the main keyword in intro and headings.",
    });

    let densityStatus: SignalStatus = "warn";
    let densityScore = 7;
    if (primaryKeyword && primaryDensity >= 0.4 && primaryDensity <= 1.5) {
      densityStatus = "pass";
      densityScore = 14;
    } else if (primaryKeyword && (primaryDensity < 0.2 || primaryDensity > 2.0)) {
      densityStatus = "fail";
      densityScore = 0;
    }

    signals.push({
      key: "primary-density",
      label: "Keyword density",
      status: densityStatus,
      score: densityScore,
      maxScore: 14,
      detail: primaryKeyword ? `${primaryDensity.toFixed(2)}%` : "No density target",
      recommendation:
        densityStatus === "pass"
          ? "Density is balanced."
          : "Keep density around 0.4% to 1.5%.",
    });

    const secondaryTotal = secondaryKeywords.length;
    const secondaryCoverage = secondaryTotal > 0 ? coveredSecondaryCount / secondaryTotal : 1;
    let secondaryStatus: SignalStatus = "pass";
    let secondaryScore = secondaryTotal > 0 ? 14 : 0;

    if (secondaryTotal > 0) {
      if (secondaryCoverage >= 0.6) {
        secondaryStatus = "pass";
        secondaryScore = 14;
      } else if (secondaryCoverage >= 0.3) {
        secondaryStatus = "warn";
        secondaryScore = 8;
      } else {
        secondaryStatus = "fail";
        secondaryScore = 0;
      }
    }

    signals.push({
      key: "secondary-coverage",
      label: "Secondary term coverage",
      status: secondaryStatus,
      score: secondaryScore,
      maxScore: secondaryTotal > 0 ? 14 : 0,
      detail:
        secondaryTotal > 0
          ? `${coveredSecondaryCount}/${secondaryTotal} terms used`
          : "No secondary terms provided",
      recommendation:
        secondaryTotal > 0
          ? "Use more secondary terms in supporting sections."
          : "No secondary keyword constraints.",
    });

    const headingStatus =
      stats.headingCount < headingTarget.min
        ? "fail"
        : stats.headingCount > headingTarget.max
          ? "warn"
          : "pass";

    signals.push({
      key: "headings",
      label: "Heading structure",
      status: headingStatus,
      score: headingStatus === "pass" ? 10 : headingStatus === "warn" ? 6 : 0,
      maxScore: 10,
      detail: `${stats.headingCount} headings (target ${headingTarget.min}-${headingTarget.max})`,
      recommendation:
        headingStatus === "pass"
          ? "Heading coverage is balanced."
          : "Adjust heading count and hierarchy.",
    });

    const paragraphStatus =
      stats.paragraphCount < paragraphTarget.min
        ? "fail"
        : stats.paragraphCount > paragraphTarget.max
          ? "warn"
          : "pass";

    signals.push({
      key: "paragraphs",
      label: "Paragraph rhythm",
      status: paragraphStatus,
      score: paragraphStatus === "pass" ? 8 : paragraphStatus === "warn" ? 4 : 0,
      maxScore: 8,
      detail: `${stats.paragraphCount} paragraphs (target ${paragraphTarget.min}-${paragraphTarget.max})`,
      recommendation:
        paragraphStatus === "pass"
          ? "Paragraph pacing is healthy."
          : "Balance paragraph density for readability.",
    });

    const imageStatus =
      stats.imageCount < imageTarget.min ? "warn" : stats.imageCount > imageTarget.max ? "warn" : "pass";

    signals.push({
      key: "images",
      label: "Media coverage",
      status: imageStatus,
      score: imageStatus === "pass" ? 6 : 3,
      maxScore: 6,
      detail: `${stats.imageCount} images (target ${imageTarget.min}-${imageTarget.max})`,
      recommendation:
        imageStatus === "pass"
          ? "Media count is aligned."
          : "Consider adding or reducing images for balance.",
    });

    const faqStatus: SignalStatus = stats.faqCount >= 1 ? "pass" : "warn";
    signals.push({
      key: "faq",
      label: "FAQ intent",
      status: faqStatus,
      score: faqStatus === "pass" ? 4 : 2,
      maxScore: 4,
      detail: `${stats.faqCount} FAQ section(s)`,
      recommendation: faqStatus === "pass" ? "FAQ intent is covered." : "Add at least one FAQ section.",
    });

    const ctaStatus: SignalStatus = stats.ctaCount >= 1 ? "pass" : "warn";
    signals.push({
      key: "cta",
      label: "Calls-to-action",
      status: ctaStatus,
      score: ctaStatus === "pass" ? 4 : 1,
      maxScore: 4,
      detail: `${stats.ctaCount} CTA links`,
      recommendation: ctaStatus === "pass" ? "CTA is present." : "Add a clear CTA link.",
    });

    return signals;
  }, [
    targetWords,
    stats.wordCount,
    stats.headingCount,
    stats.paragraphCount,
    stats.imageCount,
    stats.faqCount,
    stats.ctaCount,
    headingTarget.min,
    headingTarget.max,
    paragraphTarget.min,
    paragraphTarget.max,
    imageTarget.min,
    imageTarget.max,
    primaryKeyword,
    primaryCount,
    primaryDensity,
    secondaryKeywords.length,
    coveredSecondaryCount,
  ]);

  const liveScore = useMemo(() => {
    const max = seoSignals.reduce((sum, signal) => sum + signal.maxScore, 0);
    if (max <= 0) return 0;
    const earned = seoSignals.reduce((sum, signal) => sum + signal.score, 0);
    return clampScore((earned / max) * 100);
  }, [seoSignals]);

  const criticalSignals = useMemo(
    () =>
      seoSignals
        .filter((signal) => signal.status !== "pass")
        .sort((a, b) => a.score - b.score)
        .slice(0, 4),
    [seoSignals],
  );

  const termSignals = useMemo<TermSignal[]>(() => {
    const seen = new Set<string>();
    const terms: TermSignal[] = [];

    function addTerm(term: string, min: number, max: number) {
      const normalized = normalizeText(term).toLowerCase();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      const count = countKeyword(stats.textContent, normalized);
      const status = classifyRange(count, min, max);
      terms.push({ term: normalized, count, min, max, status });
    }

    if (primaryKeyword) addTerm(primaryKeyword, 2, 8);
    secondaryKeywords.forEach((keyword) => addTerm(keyword, 1, 5));

    (audit?.content_gaps || [])
      .filter((gap) => gap.trim().split(/\s+/).length <= 5)
      .slice(0, 8)
      .forEach((gap) => addTerm(gap, 1, 3));

    return terms;
  }, [primaryKeyword, secondaryKeywords, audit?.content_gaps, stats.textContent]);

  const filteredTerms = useMemo(() => {
    const q = normalizeText(termQuery).toLowerCase();
    if (!q) return termSignals;
    return termSignals.filter((term) => term.term.includes(q));
  }, [termSignals, termQuery]);

  const scoreGauge = useMemo(() => {
    const radius = 74;
    const circumference = Math.PI * radius;
    const ratio = liveScore / 100;
    const offset = circumference * (1 - ratio);
    return { radius, circumference, offset };
  }, [liveScore]);

  const isEditorBlank = useMemo(() => stripHtml(editorHtml).length === 0, [editorHtml]);

  useEffect(() => {
    if (!jobId) return;

    setLoading(true);
    setError("");
    setMessage("");

    let mounted = true;
    (async () => {
      try {
        const result = await getEditorDocument(jobId);
        if (!mounted) return;

        setDoc(result);
        const rawHtml =
          initialVersion === "source"
            ? result.source_html || result.optimized_html || ""
            : result.optimized_html || result.source_html || "";

        const prepared = prepareEditorSeed({
          rawHtml,
          fallbackTitle: audit?.title_tag?.current || "",
          fallbackDescription: audit?.meta_description?.options?.[0] || "",
        });

        setTemplate(prepared.template);
        setEditorHtml(prepared.seededHtml);
        setMetaTitle(prepared.metaTitle);
        setMetaDescription(prepared.metaDescription);
        setEditorSeed((prev) => prev + 1);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load editor data.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [jobId, initialVersion, audit?.meta_description?.options, audit?.title_tag?.current]);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = editorHtml || "<p></p>";
  }, [editorSeed]);

  function syncFromEditor() {
    if (!editorRef.current) return;
    setEditorHtml(editorRef.current.innerHTML);
  }

  function focusEditor() {
    editorRef.current?.focus();
  }

  function placeCaretAtEnd(element: HTMLElement) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function applyBlockFormat(tag: "p" | "h1" | "h2" | "h3") {
    focusEditor();

    if (tag === "p") {
      runEditorCommand("insertParagraph");
      return;
    }

    const formatValues = [tag.toUpperCase(), `<${tag}>`];
    let applied = false;

    for (const value of formatValues) {
      try {
        if (document.execCommand("formatBlock", false, value)) {
          applied = true;
          break;
        }
      } catch {
        // Continue to fallback.
      }
    }

    if (!applied && editorRef.current) {
      const selection = window.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (range) {
        let node: Node | null = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          node = node.parentNode;
        }

        let blockElement: HTMLElement | null = null;
        while (node && node !== editorRef.current) {
          if (
            node instanceof HTMLElement &&
            /^(P|DIV|H1|H2|H3|H4|H5|H6|LI)$/i.test(node.tagName)
          ) {
            blockElement = node;
            break;
          }
          node = node.parentNode;
        }

        if (blockElement) {
          const replacement = document.createElement(tag);
          replacement.innerHTML = blockElement.innerHTML || blockElement.textContent || "";
          blockElement.replaceWith(replacement);
          placeCaretAtEnd(replacement);
          applied = true;
        }
      }
    }

    if (!applied && editorRef.current) {
      editorRef.current.insertAdjacentHTML("beforeend", `<${tag}><br></${tag}>`);
    }

    syncFromEditor();
  }

  function runEditorCommand(command: string, value?: string) {
    focusEditor();
    try {
      document.execCommand(command, false, value);
    } catch {
      // Browser command unsupported
    }
    syncFromEditor();
  }

  function insertHtmlAtCursor(html: string) {
    focusEditor();
    let inserted = false;
    try {
      inserted = document.execCommand("insertHTML", false, html);
    } catch {
      inserted = false;
    }

    if (!inserted && editorRef.current) {
      editorRef.current.insertAdjacentHTML("beforeend", html);
    }

    syncFromEditor();
  }

  function insertLink() {
    const url = window.prompt("Enter link URL", "https://");
    if (!url || !url.trim()) return;
    runEditorCommand("createLink", url.trim());
  }

  function insertFaqTemplate() {
    insertHtmlAtCursor(
      `<section class=\"faq-item\" data-faq-item=\"true\"><h3>Question?</h3><p>Answer goes here.</p></section>`,
    );
  }

  function insertCtaTemplate() {
    insertHtmlAtCursor(`<p><a href=\"https://\" class=\"seo-cta\">Call to action</a></p>`);
  }

  function applyAuditOutline() {
    const outline = audit?.headings_plan?.outline || [];
    if (outline.length === 0 || !editorRef.current) return;

    const existing = new Set<string>();
    editorRef.current.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((node) => {
      const text = normalizeText(node.textContent || "").toLowerCase();
      if (text) existing.add(text);
    });

    const snippets: string[] = [];
    for (const row of outline) {
      const text = normalizeText(row.text || "");
      if (!text || existing.has(text.toLowerCase())) continue;
      const tagRaw = (row.tag || "h2").toLowerCase();
      const safeTag = tagRaw === "h1" || tagRaw === "h2" || tagRaw === "h3" || tagRaw === "h4" ? tagRaw : "h2";
      snippets.push(`<${safeTag}>${text}</${safeTag}>`);
    }

    if (snippets.length === 0) {
      setMessage("All audit headings are already present.");
      return;
    }

    editorRef.current.insertAdjacentHTML("beforeend", `\n${snippets.join("\n")}\n`);
    syncFromEditor();
    setMessage(`Added ${snippets.length} heading suggestion(s).`);
  }

  function applyAuditFaqPack() {
    const faqPack = audit?.faq_pack || [];
    if (faqPack.length === 0 || !editorRef.current) return;

    const existing = new Set<string>();
    editorRef.current.querySelectorAll("section.faq-item h3, [data-faq-item='true'] h3").forEach((node) => {
      const text = normalizeText(node.textContent || "").toLowerCase();
      if (text) existing.add(text);
    });

    const snippets = faqPack
      .slice(0, 6)
      .map((row) => ({
        question: normalizeText(row.question || ""),
        answer: normalizeText(row.answer || ""),
      }))
      .filter((row) => (row.question || row.answer) && !existing.has(row.question.toLowerCase()))
      .map(
        (row) =>
          `<section class=\"faq-item\" data-faq-item=\"true\"><h3>${row.question || "Question"}</h3><p>${row.answer || "Answer"}</p></section>`,
      );

    if (snippets.length === 0) {
      setMessage("All audit FAQ entries are already present.");
      return;
    }

    editorRef.current.insertAdjacentHTML("beforeend", `\n${snippets.join("\n")}\n`);
    syncFromEditor();
    setMessage(`Added ${snippets.length} FAQ suggestion(s).`);
  }

  function applyAuditSuggestions() {
    applyAuditOutline();
    applyAuditFaqPack();
  }

  async function waitForOptimizeCompletion(targetJobId: number): Promise<HistoryItem> {
    for (let attempt = 0; attempt < AUTO_OPTIMIZE_MAX_POLLS; attempt += 1) {
      const item = await getHistoryItem(targetJobId);
      if (item.status === "done" || item.status === "failed") {
        return item;
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, AUTO_OPTIMIZE_POLL_MS);
      });
    }

    throw new Error(
      "Auto-Optimize is taking longer than expected. Please refresh and check job status.",
    );
  }

  async function handleAutoOptimize() {
    if (!doc || autoOptimizing) return;

    setAutoOptimizing(true);
    setError("");
    setMessage("Running Auto-Optimize with AI...");

    try {
      const queued = await optimizeExistingJob(doc.id);
      const terminal = await waitForOptimizeCompletion(queued.id);
      if (terminal.status !== "done") {
        throw new Error(terminal.error_message || "Auto-Optimize failed.");
      }

      const updated = await getEditorDocument(doc.id);
      const prepared = prepareEditorSeed({
        rawHtml: updated.optimized_html || updated.source_html || "",
        fallbackTitle: metaTitle || audit?.title_tag?.current || "",
        fallbackDescription:
          metaDescription || audit?.meta_description?.options?.[0] || "",
      });

      setDoc(updated);
      setTemplate(prepared.template);
      setEditorHtml(prepared.seededHtml);
      setMetaTitle(prepared.metaTitle);
      setMetaDescription(prepared.metaDescription);
      setEditorSeed((prev) => prev + 1);
      setMessage("Auto-Optimize complete. AI content loaded into the editor.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-Optimize failed.");
    } finally {
      setAutoOptimizing(false);
    }
  }

  async function handleSave() {
    if (!doc) return;

    const latestHtml = editorRef.current?.innerHTML || editorHtml;
    if (!stripHtml(latestHtml)) {
      setError("Cannot save empty content.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const merged = mergeHtmlDocument(template, latestHtml);
      const withMeta = applyHeadMeta(merged, metaTitle, metaDescription);
      const updated = await saveEditorDocument(doc.id, withMeta);
      setDoc(updated);
      setEditorHtml(latestHtml);
      setMessage("Optimized HTML saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save document.");
    } finally {
      setSaving(false);
    }
  }

  if (!jobId) return null;

  const isPageMode = mode === "page";
  const outerClass = isPageMode
    ? "fixed inset-0 z-[90] bg-[#eef0f5]"
    : "fixed inset-0 z-50 bg-[#c8c9d2] p-2 sm:p-4";
  const shellClass = isPageMode
    ? "h-full w-full border-y border-[#d9dbe6] bg-[#f7f7fb] shadow-none overflow-hidden flex flex-col"
    : "h-full rounded-[18px] border border-[#cfd1dc] bg-[#f7f7fb] shadow-[0_28px_90px_rgba(11,13,28,0.22)] overflow-hidden flex flex-col";

  return (
    <div className={outerClass}>
      <div className={shellClass}>
        <header className="border-b border-[#e3e4ef] bg-[#f6f7fb]">
          <div className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-9 w-9 rounded-lg border border-[#e3e3ea] bg-white text-[#494958] hover:border-[#cacad7] transition-colors"
                aria-label="Back"
                title="Close Editor"
              >
                <svg className="mx-auto h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12.5 4.5L7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#1f2030]">Content Editor</p>
                <p className="text-[12px] text-[#6c6d7a] truncate max-w-[720px]">
                  {primaryKeyword || doc?.url || "Untitled page"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {doc?.source_html && (
                <a
                  href={getSourceExportUrl(doc.id)}
                  download
                  className="h-9 px-3 inline-flex items-center rounded-lg border border-[#e3e3ea] bg-white text-[12px] font-medium text-[#464656] hover:border-[#c9c9d6] transition-colors"
                >
                  Source
                </a>
              )}
              {doc?.optimized_html && (
                <a
                  href={getExportUrl(doc.id)}
                  download
                  className="h-9 px-3 inline-flex items-center rounded-lg border border-[#e3e3ea] bg-white text-[12px] font-medium text-[#464656] hover:border-[#c9c9d6] transition-colors"
                >
                  Export
                </a>
              )}
              <button
                type="button"
                disabled={saving || autoOptimizing}
                onClick={handleSave}
                className="h-9 px-4 rounded-lg bg-[#14151f] text-[12px] font-semibold text-white hover:bg-[#232437] disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className="px-5 pb-3 flex flex-wrap items-center gap-1.5 border-t border-[#ececf3] pt-2.5">
            <ToolbarButton label="P" title="Paragraph" onClick={() => applyBlockFormat("p")} />
            <ToolbarButton label="H1" title="Heading 1" onClick={() => applyBlockFormat("h1")} />
            <ToolbarButton label="H2" title="Heading 2" onClick={() => applyBlockFormat("h2")} />
            <ToolbarButton label="H3" title="Heading 3" onClick={() => applyBlockFormat("h3")} />
            <ToolbarButton label="B" title="Bold" onClick={() => runEditorCommand("bold")} />
            <ToolbarButton label="I" title="Italic" onClick={() => runEditorCommand("italic")} />
            <ToolbarButton label="U" title="Underline" onClick={() => runEditorCommand("underline")} />
            <ToolbarButton label="UL" title="Bullet List" onClick={() => runEditorCommand("insertUnorderedList")} />
            <ToolbarButton label="OL" title="Numbered List" onClick={() => runEditorCommand("insertOrderedList")} />
            <ToolbarButton label="Link" title="Insert Link" onClick={insertLink} />
            <ToolbarButton label="Clear" title="Clear Formatting" onClick={() => runEditorCommand("removeFormat")} />
            <span className="mx-1 h-5 w-px bg-[#dcdce6]" />
            <ToolbarButton label="FAQ" title="Insert FAQ Template" onClick={insertFaqTemplate} />
            <ToolbarButton label="CTA" title="Insert CTA Template" onClick={insertCtaTemplate} />
            <ToolbarButton
              label={autoOptimizing ? "Optimizing..." : "Auto-Optimize"}
              title="Run AI Auto-Optimize"
              onClick={handleAutoOptimize}
              disabled={autoOptimizing || !doc}
            />
          </div>
        </header>

        {(message || error) && (
          <div className="px-4 py-2 border-b border-[#ececf3] bg-[#fafafe]">
            <p className={`text-[12px] ${error ? "text-red-600" : "text-[#5d6072]"}`}>{error || message}</p>
          </div>
        )}

        <div className="flex-1 min-h-0">
          {loading ? (
            <div className="h-full grid place-items-center">
              <p className="text-[13px] text-[#7b7d8f]">Loading editor...</p>
            </div>
          ) : (
            <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_372px]">
              <section className="min-h-0 flex flex-col border-r border-[#e5e6ef] bg-white">
                <div className="px-6 py-4 border-b border-[#ececf3] bg-[#fcfcff]">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-[11px] uppercase tracking-wide text-[#828396]">Title</label>
                        <span className={`text-[11px] ${metaTitle.length > 70 ? "text-amber-600" : "text-[#999aac]"}`}>
                          {metaTitle.length}/70
                        </span>
                      </div>
                      <input
                        type="text"
                        value={metaTitle}
                        onChange={(e) => setMetaTitle(e.target.value)}
                        placeholder="SEO title"
                        className="w-full h-10 rounded-lg border border-[#e5e6ef] bg-white px-3 text-[14px] text-[#202234] placeholder:text-[#a8a9b8]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-[11px] uppercase tracking-wide text-[#828396]">Description</label>
                        <span
                          className={`text-[11px] ${metaDescription.length > 156 ? "text-amber-600" : "text-[#999aac]"}`}
                        >
                          {metaDescription.length}/156
                        </span>
                      </div>
                      <textarea
                        value={metaDescription}
                        onChange={(e) => setMetaDescription(e.target.value)}
                        placeholder="Meta description"
                        rows={2}
                        className="w-full rounded-lg border border-[#e5e6ef] bg-white px-3 py-2 text-[13px] text-[#202234] placeholder:text-[#a8a9b8] resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="relative flex-1 min-h-0 overflow-auto bg-white">
                  {isEditorBlank && (
                    <p className="absolute left-10 top-8 text-[14px] text-[#b1b2c2] pointer-events-none">
                      Start writing or paste the page content here...
                    </p>
                  )}

                  {autoOptimizing && (
                    <div className="absolute inset-0 z-20 grid place-items-center bg-white/72 backdrop-blur-[1px] transition-opacity duration-200">
                      <div className="inline-flex items-center gap-2 rounded-lg border border-[#dfe1ed] bg-white px-4 py-2 text-[13px] text-[#2a2d43] shadow-sm">
                        <svg className="h-4 w-4 animate-spin text-[#3f48bb]" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-20" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
                          <path className="opacity-90" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                        <span>Auto-Optimizing content...</span>
                      </div>
                    </div>
                  )}

                  <div
                    ref={editorRef}
                    contentEditable={!autoOptimizing}
                    suppressContentEditableWarning
                    onInput={syncFromEditor}
                    onBlur={syncFromEditor}
                    className="min-h-full mx-auto max-w-[860px] px-6 sm:px-8 lg:px-10 py-8 sm:py-10 text-[16px] leading-[1.75] text-[#1f2133] outline-none
                      [&_h1]:text-[38px] [&_h1]:leading-[1.14] [&_h1]:font-semibold [&_h1]:tracking-[-0.02em] [&_h1]:mt-8 [&_h1]:mb-4
                      [&_h2]:text-[30px] [&_h2]:leading-[1.22] [&_h2]:font-semibold [&_h2]:tracking-[-0.012em] [&_h2]:mt-8 [&_h2]:mb-3
                      [&_h3]:text-[24px] [&_h3]:leading-[1.28] [&_h3]:font-semibold [&_h3]:mt-7 [&_h3]:mb-3
                      [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1.5
                      [&_a]:text-[#3f48bb] [&_a]:underline [&_section.faq-item]:my-6 [&_section.faq-item>h3]:text-[26px] [&_section.faq-item>h3]:font-semibold"
                  />
                </div>
              </section>

              <aside className="min-h-0 overflow-auto bg-[#f9faff]">
                <div className="p-3 space-y-3">
                  <div className="grid grid-cols-3 rounded-xl bg-[#f1f2f8] p-1">
                    {(["guidelines", "facts", "outline"] as SideTab[]).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setSideTab(tab)}
                        className={`h-8 rounded-lg text-[11px] uppercase tracking-wide font-semibold ${
                          sideTab === tab ? "bg-white text-[#3f2fa5] shadow-sm" : "text-[#7b7d90]"
                        }`}
                      >
                        {tab === "guidelines" ? "Guidelines" : tab === "facts" ? "Facts" : "Outline"}
                      </button>
                    ))}
                  </div>

                  {sideTab === "guidelines" && (
                    <>
                      <section className="rounded-xl border border-[#e8e8f1] bg-white p-3">
                        <p className="text-[12px] font-semibold text-[#2a2d43]">Content Score</p>
                        <div className="relative mt-2">
                          <svg viewBox="0 0 200 118" className="w-full h-32">
                            <defs>
                              <linearGradient id={`score-gradient-${jobId || "x"}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#eb5757" />
                                <stop offset="52%" stopColor="#f2c94c" />
                                <stop offset="100%" stopColor="#6fcf97" />
                              </linearGradient>
                            </defs>
                            <path
                              d="M 20 98 A 74 74 0 0 1 180 98"
                              fill="none"
                              stroke="#ececf2"
                              strokeWidth="14"
                              strokeLinecap="round"
                            />
                            <path
                              d="M 20 98 A 74 74 0 0 1 180 98"
                              fill="none"
                              stroke={`url(#score-gradient-${jobId || "x"})`}
                              strokeWidth="14"
                              strokeLinecap="round"
                              strokeDasharray={`${scoreGauge.circumference} ${scoreGauge.circumference}`}
                              strokeDashoffset={scoreGauge.offset}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-end pb-3">
                            <p className="text-[42px] leading-none font-semibold text-[#222438]">{liveScore}</p>
                            <p className="text-[12px] text-[#7a7d91] mt-1">{scoreLabel(liveScore)}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[12px] text-[#6d7085]">
                          <span>Audit {audit?.overall_score ?? "-"}</span>
                          <span>Target {targetWords} words</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleAutoOptimize}
                          disabled={autoOptimizing || !doc}
                          className="mt-3 w-full h-10 rounded-lg bg-[#151622] text-white text-[13px] font-semibold hover:bg-[#24263a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {autoOptimizing ? (
                            <span className="inline-flex items-center gap-2">
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
                                <path className="opacity-90" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                              </svg>
                              <span>Auto-Optimizing...</span>
                            </span>
                          ) : (
                            "Auto-Optimize"
                          )}
                        </button>
                      </section>

                      <section className="rounded-xl border border-[#e8e8f1] bg-white p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[12px] font-semibold text-[#2a2d43]">Content Structure</p>
                          <span className="text-[11px] text-[#8a8da4]">Live</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {[
                            {
                              label: "Words",
                              value: stats.wordCount,
                              range: `${Math.round(targetWords * 0.85)}-${Math.round(targetWords * 1.2)}`,
                              status: classifyRange(
                                stats.wordCount,
                                Math.round(targetWords * 0.85),
                                Math.round(targetWords * 1.2),
                              ),
                            },
                            {
                              label: "Headings",
                              value: stats.headingCount,
                              range: `${headingTarget.min}-${headingTarget.max}`,
                              status: classifyRange(stats.headingCount, headingTarget.min, headingTarget.max),
                            },
                            {
                              label: "Paragraphs",
                              value: stats.paragraphCount,
                              range: `${paragraphTarget.min}-${paragraphTarget.max}`,
                              status: classifyRange(
                                stats.paragraphCount,
                                paragraphTarget.min,
                                paragraphTarget.max,
                              ),
                            },
                            {
                              label: "Images",
                              value: stats.imageCount,
                              range: `${imageTarget.min}-${imageTarget.max}`,
                              status: classifyRange(stats.imageCount, imageTarget.min, imageTarget.max),
                            },
                          ].map((item) => (
                            <div key={item.label} className="rounded-lg border border-[#eef0f6] bg-[#fcfcff] p-2.5">
                              <p className="text-[10px] uppercase tracking-wide text-[#8f92a8]">{item.label}</p>
                              <p className={`text-[20px] font-semibold leading-none mt-1 ${metricTone(item.status)}`}>
                                {item.value}
                              </p>
                              <p className="text-[11px] text-[#8d90a6] mt-1">{item.range}</p>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="rounded-xl border border-[#e8e8f1] bg-white p-3">
                        <p className="text-[12px] font-semibold text-[#2a2d43]">Terms</p>
                        <input
                          type="text"
                          value={termQuery}
                          onChange={(e) => setTermQuery(e.target.value)}
                          placeholder="Search terms"
                          className="mt-2 w-full h-9 rounded-lg border border-[#e2e4ee] bg-[#fbfbfe] px-3 text-[12px]"
                        />
                        <div className="mt-2 max-h-56 overflow-auto space-y-1.5 pr-1">
                          {filteredTerms.slice(0, 30).map((entry) => (
                            <div
                              key={entry.term}
                              className={`rounded-md border px-2.5 py-1.5 text-[12px] ${termTone(entry.status)}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate">{entry.term}</span>
                                <span className="font-semibold tabular-nums">
                                  {entry.count}/{entry.min}-{entry.max}
                                </span>
                              </div>
                            </div>
                          ))}
                          {filteredTerms.length === 0 && (
                            <p className="text-[12px] text-[#9a9db2] py-1">No terms match this query.</p>
                          )}
                        </div>
                      </section>
                    </>
                  )}

                  {sideTab === "facts" && (
                    <>
                      <section className="rounded-xl border border-[#e8e8f1] bg-white p-3">
                        <p className="text-[12px] font-semibold text-[#2a2d43]">Priority Fixes</p>
                        <div className="mt-2 space-y-2">
                          {criticalSignals.length > 0 ? (
                            criticalSignals.map((signal) => (
                              <div key={signal.key} className="rounded-lg border border-[#ececf3] p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[12px] text-[#303248] font-medium">{signal.label}</p>
                                  <span
                                    className={`px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${statusTone(signal.status).badge}`}
                                  >
                                    {signal.status}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[#7a7d93] mt-1">{signal.recommendation}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-[12px] text-[#8f91a6]">No critical issues detected.</p>
                          )}
                        </div>
                      </section>

                      <section className="rounded-xl border border-[#e8e8f1] bg-white p-3">
                        <p className="text-[12px] font-semibold text-[#2a2d43]">Strengths</p>
                        <div className="mt-2 space-y-1.5">
                          {(audit?.strengths || []).length > 0 ? (
                            (audit?.strengths || []).map((row, idx) => (
                              <p key={`${row}-${idx}`} className="text-[12px] text-[#5f6278]">
                                - {row}
                              </p>
                            ))
                          ) : (
                            <p className="text-[12px] text-[#9295aa]">No strengths listed by audit.</p>
                          )}
                        </div>
                      </section>

                      <section className="rounded-xl border border-[#e8e8f1] bg-white p-3">
                        <p className="text-[12px] font-semibold text-[#2a2d43]">Content Gaps</p>
                        <div className="mt-2 space-y-1.5">
                          {(audit?.content_gaps || []).length > 0 ? (
                            (audit?.content_gaps || []).map((row, idx) => (
                              <p key={`${row}-${idx}`} className="text-[12px] text-[#5f6278]">
                                - {row}
                              </p>
                            ))
                          ) : (
                            <p className="text-[12px] text-[#9295aa]">No content gaps listed by audit.</p>
                          )}
                        </div>
                      </section>
                    </>
                  )}

                  {sideTab === "outline" && (
                    <>
                      <section className="rounded-xl border border-[#e8e8f1] bg-white p-3">
                        <p className="text-[12px] font-semibold text-[#2a2d43]">Recommended Outline</p>
                        {audit?.headings_plan ? (
                          <div className="mt-2 space-y-2">
                            <p className="text-[12px] text-[#3a3d54]">
                              H1: <span className="font-semibold">{audit.headings_plan.recommended_h1}</span>
                            </p>
                            {(audit.headings_plan.outline || []).map((row, idx) => (
                              <div key={`${row.tag}-${row.text}-${idx}`} className="flex items-start gap-2 text-[12px]">
                                <span className="mt-0.5 rounded bg-[#f1f2f8] px-1.5 py-0.5 text-[10px] uppercase text-[#6f7288]">
                                  {row.tag}
                                </span>
                                <p className="text-[#4a4d63]">{row.text}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-[12px] text-[#9295aa]">No outline recommendation available.</p>
                        )}
                      </section>

                      <section className="rounded-xl border border-[#e8e8f1] bg-white p-3">
                        <p className="text-[12px] font-semibold text-[#2a2d43]">Checklist</p>
                        {audit?.checklist && audit.checklist.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {audit.checklist
                              .slice()
                              .sort((a, b) => a.priority - b.priority)
                              .slice(0, 12)
                              .map((item, idx) => (
                                <div key={`${item.task}-${idx}`} className="rounded-md border border-[#ececf3] p-2">
                                  <p className="text-[12px] text-[#3f4259]">
                                    {item.priority}. {item.task}
                                  </p>
                                  <p className="text-[11px] text-[#8c90a6] mt-0.5">{item.location}</p>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-[12px] text-[#9295aa]">No checklist items available.</p>
                        )}
                      </section>

                      <section className="rounded-xl border border-[#e8e8f1] bg-white p-3">
                        <p className="text-[12px] font-semibold text-[#2a2d43]">Signal Breakdown</p>
                        <div className="mt-2 space-y-1.5">
                          {seoSignals.map((signal) => (
                            <div key={signal.key} className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[12px] text-[#3f4258]">{signal.label}</p>
                                <p className="text-[11px] text-[#8b8ea4]">{signal.detail}</p>
                              </div>
                              <span className={`text-[10px] uppercase ${statusTone(signal.status).text}`}>
                                {signal.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
