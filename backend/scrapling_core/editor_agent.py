"""
Editor Agent — rewrites page content based on SEO audit recommendations.
Outputs clean, optimized HTML ready to hand to a dev team.
"""
import json

from langchain_core.prompts import PromptTemplate


EDITOR_PROMPT = PromptTemplate(
    input_variables=["keyword", "original_text", "title", "recommendations"],
    template="""You are an expert SEO content editor. Your job is to apply specific SEO optimizations to a page and output clean HTML.

Target keyword: {keyword}

CURRENT TITLE TAG:
{title}

RECOMMENDATIONS TO APPLY:
{recommendations}

ORIGINAL PAGE CONTENT:
{original_text}

Instructions:
- Apply ALL the listed recommendations to produce optimized content.
- Output clean HTML that a dev team can directly use.
- Include these elements in order:
  1. A comment with the optimized <title> tag: <!-- TITLE: optimized title here -->
  2. A comment with the optimized meta description: <!-- META_DESCRIPTION: optimized description here -->
  3. The full optimized body content using proper HTML tags:
     - <h1> for the main heading (only one)
     - <h2> for section headings
     - <h3> for sub-section headings
     - <p> for paragraphs
     - <ul>/<li> for lists where appropriate
     - <strong> for important keywords (use sparingly)
- Preserve the original tone and meaning — optimize, don't rewrite from scratch.
- Naturally incorporate the target keyword and missing topics from the recommendations.
- Do NOT include <html>, <head>, <body>, or <style> tags — just the content HTML.
- Do NOT wrap the output in markdown code fences.
- Output ONLY the HTML content, nothing else."""
)


def _truncate(text: str, max_chars: int = 8000) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n[... truncated ...]"


def run_editor(llm, keyword: str, original_text: str, title: str, audit: dict) -> str:
    """
    Run the Editor Agent to produce optimized HTML content.

    Args:
        llm:            LangChain LLM instance.
        keyword:        Target keyword.
        original_text:  Original page body text.
        title:          Current page title.
        audit:          Full audit result from seo_agent.

    Returns:
        Optimized HTML string.
    """
    # Format recommendations into a clear list
    rec_lines = []

    if audit.get("title_tag", {}).get("recommendation"):
        rec_lines.append(f"TITLE: {audit['title_tag']['recommendation']}")

    if audit.get("meta_description", {}).get("recommendation"):
        rec_lines.append(f"META: {audit['meta_description']['recommendation']}")

    if audit.get("headings", {}).get("recommendation"):
        rec_lines.append(f"HEADINGS: {audit['headings']['recommendation']}")

    if audit.get("word_count", {}).get("recommendation"):
        rec_lines.append(f"WORD COUNT: {audit['word_count']['recommendation']}")

    if audit.get("keyword_usage", {}).get("recommendation"):
        rec_lines.append(f"KEYWORDS: {audit['keyword_usage']['recommendation']}")

    for gap in audit.get("content_gaps", []):
        rec_lines.append(f"CONTENT GAP: Add coverage of \"{gap}\"")

    for rec in audit.get("recommendations", []):
        rec_lines.append(f"#{rec.get('priority', '-')} [{rec.get('type', '')}]: {rec.get('action', '')}")

    recommendations_str = "\n".join(rec_lines) if rec_lines else "No specific recommendations."

    chain = EDITOR_PROMPT | llm
    result = chain.invoke({
        "keyword": keyword,
        "original_text": _truncate(original_text, 6000),
        "title": title or "(no title)",
        "recommendations": recommendations_str,
    })

    html = result.content.strip()

    # Strip markdown fences if the model wrapped it
    if html.startswith("```html"):
        html = html[7:]
    if html.startswith("```"):
        html = html[3:]
    if html.endswith("```"):
        html = html[:-3]

    return html.strip()
