"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorCanvas } from "@/components/editor/EditorCanvas";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { MetaFieldsPanel } from "@/components/editor/MetaFieldsPanel";
import { SeoSignalsSidebar } from "@/components/editor/SeoSignalsSidebar";
import type { SeoSignal, SideTab, SignalStatus, TermSignal, TermStatus } from "@/components/editor/types";
import {
  getEditorDocument,
  getExportUrl,
  getSourceExportUrl,
  getHistoryItem,
  optimizeExistingJob,
  saveEditorDocument,
} from "@/lib/apiClient";
import { parseAuditResult } from "@/lib/auditResult";
import { sanitizeEditorHtml } from "@/lib/htmlSanitizer";
import { AUTO_OPTIMIZE_MAX_POLLS, AUTO_OPTIMIZE_POLL_MS, EDITOR_DEFAULT_TARGET_WORDS, EDITOR_STATS_DEBOUNCE_MS } from "@/lib/constants";
import {
  applyHeadMeta,
  extractHeadMeta,
  mergeHtmlDocument,
  normalizeText,
  splitHtmlDocument,
  stripHtml,
  stripPageChrome,
} from "@/lib/htmlUtils";
import type { HtmlTemplate } from "@/lib/htmlUtils";
import { collectEditorStats, countKeyword } from "@/lib/seoAnalysis";
import type { EditorDocument, HistoryItem } from "@/types";

interface Props {
  jobId: number | null;
  initialVersion?: "source" | "optimized";
  contextItem?: HistoryItem | null;
  mode?: "modal" | "page";
  onClose: () => void;
}

function clampScore(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function classifyRange(value: number, min: number, max: number): TermStatus {
  if (value < min) return "low";
  if (value > max) return "high";
  return "good";
}

const NON_CONTENT_BLOCK_RE = /<(script|style|noscript|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;
const CHROME_CONTAINER_RE = /<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Builds initial editor state from raw HTML and fallback metadata.
 * @param input Raw HTML plus fallback title/description values.
 * @returns Seeded template/body/meta values for the editor UI.
 */
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
  const heuristicSource = split.editableHtml.replace(NON_CONTENT_BLOCK_RE, " ").replace(CHROME_CONTAINER_RE, " ");
  const originalText = stripHtml(heuristicSource);
  const cleanedWordCount = cleanedText ? cleanedText.split(/\s+/).length : 0;
  const originalWordCount = originalText ? originalText.split(/\s+/).length : 0;
  const cleanedHeadingCount = (cleaned.match(/<h[1-6]\b/gi) || []).length;
  const cleanedParagraphCount = (cleaned.match(/<p\b/gi) || []).length;
  const cleanedImageCount = (cleaned.match(/<img\b/gi) || []).length;
  const cleanedLinkCount = (cleaned.match(/<a\b/gi) || []).length;
  const hasContentStructure = cleanedHeadingCount + cleanedParagraphCount + cleanedImageCount > 0;
  const looksLikeMenu = cleanedLinkCount >= 12 && cleanedParagraphCount === 0 && cleanedHeadingCount <= 1;
  const cleanedKeepsEnoughContent =
    cleanedWordCount >= 40 &&
    !looksLikeMenu &&
    (originalWordCount === 0 ||
      cleanedWordCount >= Math.min(220, Math.floor(originalWordCount * 0.2)) ||
      (hasContentStructure && cleanedWordCount >= 80));
  const seededBase = cleanedKeepsEnoughContent
    ? cleaned.trim()
    : split.editableHtml.trim();
  const seeded = seededBase ? seededBase : "<p></p>";
  const meta = extractHeadMeta(input.rawHtml);

  return {
    template: split.template,
    seededHtml: sanitizeEditorHtml(seeded),
    metaTitle: meta.title || input.fallbackTitle,
    metaDescription: meta.description || input.fallbackDescription,
  };
}

function shouldPreferOptimizedFromSeed(seededHtml: string): boolean {
  const headingCount = (seededHtml.match(/<h[1-6]\b/gi) || []).length;
  const linkCount = (seededHtml.match(/<a\b/gi) || []).length;
  const plainText = normalizeText(stripHtml(seededHtml));
  const wordCount = plainText ? plainText.split(/\s+/).length : 0;

  // Source snapshots from chrome-heavy pages can collapse into mostly link lists.
  return headingCount === 0 && linkCount >= 8 && wordCount < 500;
}

function toEditorLoadErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to load editor data.";
  const message = error.message || "";

  if (/API error 404/i.test(message) && /No HTML artifacts available for this job/i.test(message)) {
    return "No HTML artifacts are available for this audit yet. Wait for scan or optimize to finish, then open the editor again.";
  }

  if (/API error 404/i.test(message)) {
    return "This audit has no editable HTML yet. Run scan or optimize first, then reopen the editor.";
  }

  return message;
}

export function HtmlEditorPanel({
  jobId,
  initialVersion = "optimized",
  contextItem,
  mode = "modal",
  onClose,
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);
  const seededEditorHtmlRef = useRef("<p></p>");

  const [doc, setDoc] = useState<EditorDocument | null>(null);
  const [template, setTemplate] = useState<HtmlTemplate>({ prefix: "", suffix: "" });
  const [editorHtml, setEditorHtml] = useState("");
  const [statsInputHtml, setStatsInputHtml] = useState("");
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

  const audit = useMemo(() => parseAuditResult(contextItem?.audit_result), [contextItem?.audit_result]);
  const auditFallbackTitle = audit?.title_tag?.current || "";
  const auditFallbackDescription = audit?.meta_description?.options?.[0] || "";

  const stats = useMemo(() => collectEditorStats(statsInputHtml), [statsInputHtml]);

  const targetWords = useMemo(() => {
    const fromAudit = audit?.word_count?.serp_avg;
    if (typeof fromAudit === "number" && fromAudit > 0) {
      return Math.max(EDITOR_DEFAULT_TARGET_WORDS, Math.round(fromAudit));
    }
    return EDITOR_DEFAULT_TARGET_WORDS;
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
  }, [audit]);

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
      label: "Secondary keyword coverage",
      status: secondaryStatus,
      score: secondaryScore,
      maxScore: secondaryTotal > 0 ? 14 : 0,
      detail:
        secondaryTotal > 0
          ? `${coveredSecondaryCount}/${secondaryTotal} keywords used`
          : "No secondary keywords provided",
      recommendation:
        secondaryTotal > 0
          ? "Use more secondary keywords in supporting sections."
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

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setStatsInputHtml(editorHtml);
    }, EDITOR_STATS_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [editorHtml]);

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
          fallbackTitle: auditFallbackTitle,
          fallbackDescription: auditFallbackDescription,
        });
        const finalPrepared =
          initialVersion === "source" &&
          !!result.optimized_html &&
          shouldPreferOptimizedFromSeed(prepared.seededHtml)
            ? prepareEditorSeed({
                rawHtml: result.optimized_html,
                fallbackTitle: auditFallbackTitle,
                fallbackDescription: auditFallbackDescription,
              })
            : prepared;

        setTemplate(finalPrepared.template);
        seededEditorHtmlRef.current = finalPrepared.seededHtml;
        setEditorHtml(finalPrepared.seededHtml);
        setMetaTitle(finalPrepared.metaTitle);
        setMetaDescription(finalPrepared.metaDescription);
        setEditorSeed((prev) => prev + 1);
      } catch (err) {
        if (!mounted) return;
        setError(toEditorLoadErrorMessage(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [jobId, initialVersion, auditFallbackTitle, auditFallbackDescription]);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = sanitizeEditorHtml(seededEditorHtmlRef.current || "<p></p>");
  }, [editorSeed]);

  function syncFromEditor() {
    if (!editorRef.current) return;
    setEditorHtml(sanitizeEditorHtml(editorRef.current.innerHTML));
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

  async function waitForOptimizeCompletion(targetJobId: number): Promise<HistoryItem> {
    for (let attempt = 0; attempt < AUTO_OPTIMIZE_MAX_POLLS; attempt += 1) {
      if (!isMountedRef.current) {
        throw new Error("Auto-Optimize was cancelled.");
      }

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
      if (!isMountedRef.current) return;

      const prepared = prepareEditorSeed({
        rawHtml: updated.optimized_html || updated.source_html || "",
        fallbackTitle: metaTitle || auditFallbackTitle,
        fallbackDescription: metaDescription || auditFallbackDescription,
      });

      setDoc(updated);
      setTemplate(prepared.template);
      seededEditorHtmlRef.current = prepared.seededHtml;
      setEditorHtml(prepared.seededHtml);
      setMetaTitle(prepared.metaTitle);
      setMetaDescription(prepared.metaDescription);
      setEditorSeed((prev) => prev + 1);
      setMessage("Auto-Optimize complete. Optimized content loaded into the editor.");
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : "Auto-Optimize failed.");
    } finally {
      if (!isMountedRef.current) return;
      setAutoOptimizing(false);
    }
  }

  async function handleSave() {
    if (!doc) return;

    const latestHtml = sanitizeEditorHtml(editorRef.current?.innerHTML || editorHtml);
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
    ? "fixed inset-0 z-[90] bg-[#edf1f9]"
    : "fixed inset-0 z-50 bg-[#c8cedb] p-2 sm:p-4";
  const shellClass = isPageMode
    ? "flex h-full w-full flex-col overflow-hidden border-y border-[#d9deeb] bg-[#f6f8ff] shadow-none"
    : "flex h-full flex-col overflow-hidden rounded-[18px] border border-[#cfd5e4] bg-[#f6f8ff] shadow-[0_28px_90px_rgba(11,13,28,0.22)]";

  return (
    <div className={outerClass}>
      <div className={shellClass}>
        <header className="border-b border-[#e5e8f2] bg-white/90 backdrop-blur-[4px]">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-9 w-9 rounded-lg border border-[#dde2ef] bg-white text-[#494958] shadow-[0_1px_0_rgba(17,24,39,0.02)] transition-colors hover:border-[#c5cde0]"
                aria-label="Back"
                title="Close Editor"
              >
                <svg className="mx-auto h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12.5 4.5L7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#1f2030]">Content Editor</p>
                <p className="max-w-[720px] truncate text-[12px] text-[#636a80]">
                  {primaryKeyword || doc?.url || "Untitled page"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {doc?.source_html && (
                <a
                  href={getSourceExportUrl(doc.id)}
                  download
                  className="inline-flex h-9 items-center rounded-lg border border-[#dde2ef] bg-white px-3 text-[12px] font-medium text-[#464656] shadow-[0_1px_0_rgba(17,24,39,0.02)] transition-colors hover:border-[#c5cde0]"
                >
                  Source
                </a>
              )}
              {doc?.optimized_html && (
                <a
                  href={getExportUrl(doc.id)}
                  download
                  className="inline-flex h-9 items-center rounded-lg border border-[#dde2ef] bg-white px-3 text-[12px] font-medium text-[#464656] shadow-[0_1px_0_rgba(17,24,39,0.02)] transition-colors hover:border-[#c5cde0]"
                >
                  Export
                </a>
              )}
              <button
                type="button"
                disabled={saving || autoOptimizing}
                onClick={handleSave}
                className="h-9 rounded-lg bg-[#14151f] px-4 text-[12px] font-semibold text-white shadow-[0_8px_20px_rgba(15,18,31,0.18)] transition-colors hover:bg-[#232437] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <EditorToolbar
            autoOptimizing={autoOptimizing}
            hasDocument={!!doc}
            onApplyBlockFormat={applyBlockFormat}
            onRunEditorCommand={runEditorCommand}
            onInsertLink={insertLink}
            onInsertFaqTemplate={insertFaqTemplate}
            onInsertCtaTemplate={insertCtaTemplate}
            onAutoOptimize={handleAutoOptimize}
          />
        </header>

        {(message || error) && (
          <div className="border-b border-[#e8ebf4] bg-[#f9fbff] px-4 py-2.5">
            <p className={`text-[12px] ${error ? "text-red-600" : "text-[#5d6072]"}`}>{error || message}</p>
          </div>
        )}

        <div className="flex-1 min-h-0">
          {loading ? (
            <div className="h-full grid place-items-center">
              <p className="text-[13px] text-[#7b7d8f]">Loading editor...</p>
            </div>
          ) : (
            <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_388px]">
              <section className="min-h-0 flex flex-col border-r border-[#e6e9f3] bg-white">
                <MetaFieldsPanel
                  metaTitle={metaTitle}
                  metaDescription={metaDescription}
                  onMetaTitleChange={setMetaTitle}
                  onMetaDescriptionChange={setMetaDescription}
                />
                <EditorCanvas
                  editorRef={editorRef}
                  autoOptimizing={autoOptimizing}
                  onSyncFromEditor={syncFromEditor}
                />
              </section>

              <SeoSignalsSidebar
                jobId={jobId}
                sideTab={sideTab}
                liveScore={liveScore}
                targetWords={targetWords}
                autoOptimizing={autoOptimizing}
                hasDocument={!!doc}
                scoreGauge={scoreGauge}
                stats={{
                  wordCount: stats.wordCount,
                  headingCount: stats.headingCount,
                  paragraphCount: stats.paragraphCount,
                  imageCount: stats.imageCount,
                }}
                headingTarget={headingTarget}
                paragraphTarget={paragraphTarget}
                imageTarget={imageTarget}
                termQuery={termQuery}
                filteredTerms={filteredTerms}
                criticalSignals={criticalSignals}
                seoSignals={seoSignals}
                audit={audit}
                onAutoOptimize={handleAutoOptimize}
                onSideTabChange={setSideTab}
                onTermQueryChange={setTermQuery}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
