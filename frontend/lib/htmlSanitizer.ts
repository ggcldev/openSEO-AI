import DOMPurify from "dompurify";
import type { Config as DomPurifyConfig } from "dompurify";

const EDITOR_SANITIZE_OPTIONS: DomPurifyConfig = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "link", "meta", "base"],
};

/**
 * Sanitizes editor HTML before rendering or persisting.
 * @param inputHtml Candidate HTML markup.
 * @returns Sanitized HTML, or an empty paragraph fallback.
 */
export function sanitizeEditorHtml(inputHtml: string): string {
  if (!inputHtml.trim()) return "<p></p>";
  const sanitized = DOMPurify.sanitize(inputHtml, EDITOR_SANITIZE_OPTIONS).trim();
  return sanitized || "<p></p>";
}
