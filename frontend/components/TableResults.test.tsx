import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TableResults } from "@/components/TableResults";
import type { HistoryItem } from "@/types";

function buildHistoryItem(overrides?: Partial<HistoryItem>): HistoryItem {
  return {
    id: 1,
    url: "https://example.com/page",
    keyword: "seo",
    goal: "leads",
    num_competitors: 10,
    pipeline_mode: "scan",
    status: "done",
    detected_intent: "informational",
    page_type: "service",
    region: "global",
    language: "en",
    error_stage: null,
    error_code: null,
    error_message: null,
    audit_result: JSON.stringify({ overall_score: 82 }),
    has_source_html: true,
    has_export: false,
    can_optimize: true,
    created_at: "2026-03-06T00:00:00Z",
    finished_at: "2026-03-06T00:01:00Z",
    ...overrides,
  };
}

describe("TableResults", () => {
  it("shows empty-state text when no items exist", () => {
    render(
      <TableResults
        items={[]}
        onOpenEditor={vi.fn()}
        onOpenDetails={vi.fn()}
        onOptimizeJob={vi.fn()}
        optimizingJobId={null}
      />,
    );

    expect(screen.getByText("No jobs yet")).toBeInTheDocument();
  });

  it("renders parsed audit score for valid audit_result", () => {
    render(
      <TableResults
        items={[buildHistoryItem()]}
        onOpenEditor={vi.fn()}
        onOpenDetails={vi.fn()}
        onOptimizeJob={vi.fn()}
        optimizingJobId={null}
      />,
    );

    expect(screen.getByText("82")).toBeInTheDocument();
  });

  it("shows fallback details block when expanded item has malformed audit_result", () => {
    render(
      <TableResults
        items={[buildHistoryItem({ id: 11, audit_result: "{malformed" })]}
        onOpenEditor={vi.fn()}
        onOpenDetails={vi.fn()}
        onOptimizeJob={vi.fn()}
        optimizingJobId={null}
      />,
    );

    fireEvent.click(screen.getByText("https://example.com/page"));
    expect(
      screen.getByText("Audit details are unavailable for this run. You can still open details, open the editor, or re-run optimize."),
    ).toBeInTheDocument();
  });
});
