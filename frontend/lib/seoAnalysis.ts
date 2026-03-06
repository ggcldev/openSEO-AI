import { normalizeText, stripHtml } from "@/lib/htmlUtils";

export interface EditorStats {
  textContent: string;
  wordCount: number;
  headingCount: number;
  paragraphCount: number;
  faqCount: number;
  ctaCount: number;
  imageCount: number;
}

const KEYWORD_REGEX_CACHE = new Map<string, RegExp>();
const SHARED_DOM_PARSER = typeof DOMParser === "undefined" ? null : new DOMParser();

/**
 * Computes SEO-relevant structural stats from editor HTML.
 * @param html Current editable HTML snapshot.
 * @returns Aggregated text and element-count metrics.
 */
export function collectEditorStats(html: string): EditorStats {
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

  if (!SHARED_DOM_PARSER) {
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

  const parsed = SHARED_DOM_PARSER.parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");

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

/**
 * Counts whole-word keyword matches in normalized text.
 * @param text Source plain text.
 * @param keyword Target phrase to count.
 * @returns Number of whole-word matches.
 */
export function countKeyword(text: string, keyword: string): number {
  const target = keyword.trim().toLowerCase();
  if (!target) return 0;

  let regex = KEYWORD_REGEX_CACHE.get(target);
  if (!regex) {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(`\\b${escaped}\\b`, "g");
    KEYWORD_REGEX_CACHE.set(target, regex);
  }

  const source = text.toLowerCase();
  const matches = source.match(regex);
  return matches ? matches.length : 0;
}
