import { describe, expect, it } from "vitest";
import { collectEditorStats, countKeyword } from "@/lib/seoAnalysis";

describe("seoAnalysis", () => {
  it("countKeyword counts whole-word matches only", () => {
    const text = "Solar power is great. Solar panels help. Insolar is different.";

    expect(countKeyword(text, "solar")).toBe(2);
    expect(countKeyword(text, "")).toBe(0);
  });

  it("collectEditorStats computes structural counts", () => {
    const html = `
      <article>
        <h1>Guide</h1>
        <h2>What is this?</h2>
        <p>Paragraph one with content.</p>
        <p>Paragraph two with content.</p>
        <a href=\"/start\">Get Started</a>
        <img src=\"hero.jpg\" alt=\"hero\" />
      </article>
    `;

    const stats = collectEditorStats(html);

    expect(stats.wordCount).toBeGreaterThan(5);
    expect(stats.headingCount).toBe(2);
    expect(stats.paragraphCount).toBe(2);
    expect(stats.ctaCount).toBe(1);
    expect(stats.imageCount).toBe(1);
    expect(stats.faqCount).toBe(1);
  });

  it("collectEditorStats returns zeros for empty input", () => {
    expect(collectEditorStats("   ")).toEqual({
      textContent: "",
      wordCount: 0,
      headingCount: 0,
      paragraphCount: 0,
      faqCount: 0,
      ctaCount: 0,
      imageCount: 0,
    });
  });
});
