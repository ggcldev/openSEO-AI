import { describe, expect, it } from "vitest";
import { parseAuditResult } from "@/lib/auditResult";

describe("parseAuditResult", () => {
  it("returns null for missing payload", () => {
    expect(parseAuditResult(null)).toBeNull();
    expect(parseAuditResult(undefined)).toBeNull();
    expect(parseAuditResult("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseAuditResult("{bad json")).toBeNull();
  });

  it("parses valid audit payload", () => {
    const parsed = parseAuditResult(
      JSON.stringify({
        overall_score: 79,
        keywords: { primary: "seo", secondary: ["audit", "content"], intent_cluster: "informational" },
        title_tag: { current: "Old", options: ["New"] },
        checklist: [{ task: "Improve heading", location: "H1", priority: 1 }],
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.overall_score).toBe(79);
    expect(parsed?.keywords?.primary).toBe("seo");
    expect(parsed?.checklist?.[0]?.task).toBe("Improve heading");
  });

  it("supports parse_error payloads without overall_score", () => {
    const parsed = parseAuditResult(
      JSON.stringify({
        parse_error: true,
        raw_output: "LLM raw text",
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.parse_error).toBe(true);
    expect(parsed?.overall_score).toBe(0);
    expect(parsed?.raw_output).toBe("LLM raw text");
  });

  it("drops invalid nested values safely", () => {
    const parsed = parseAuditResult(
      JSON.stringify({
        overall_score: 65,
        faq_pack: [{ question: "Q1", answer: "A1" }, { question: 123, answer: true }],
        content_gaps: ["schema", 7],
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.faq_pack).toEqual([{ question: "Q1", answer: "A1" }]);
    expect(parsed?.content_gaps).toEqual(["schema"]);
  });
});
