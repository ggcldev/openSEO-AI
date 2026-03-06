import { describe, expect, it } from "vitest";
import { sanitizeEditorHtml } from "@/lib/htmlSanitizer";

describe("sanitizeEditorHtml", () => {
  it("returns fallback paragraph for empty input", () => {
    expect(sanitizeEditorHtml("")).toBe("<p></p>");
    expect(sanitizeEditorHtml("   ")).toBe("<p></p>");
  });

  it("removes dangerous script and iframe tags", () => {
    const unsafe = '<p>Safe</p><script>alert(1)</script><iframe src="https://evil.example"></iframe>';
    const result = sanitizeEditorHtml(unsafe);

    expect(result).toContain("<p>Safe</p>");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("<iframe");
  });

  it("removes inline event handlers but keeps safe image tags", () => {
    const unsafe = '<img src="hero.jpg" onerror="alert(1)" alt="Hero">';
    const result = sanitizeEditorHtml(unsafe);

    expect(result).toContain("<img");
    expect(result).toContain('src="hero.jpg"');
    expect(result).not.toContain("onerror");
  });

  it("strips metadata tags disallowed by editor policy", () => {
    const html = '<meta name="description" content="x"><link rel="stylesheet" href="x.css"><p>Body</p>';
    const result = sanitizeEditorHtml(html);

    expect(result).toContain("<p>Body</p>");
    expect(result).not.toContain("<meta");
    expect(result).not.toContain("<link");
  });
});
