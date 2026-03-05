"""
Editor Agent — rewrites page content based on SEO audit recommendations.
Outputs clean, optimized HTML tailored to the page's intent type.
"""
import os
import re

from langchain_core.prompts import PromptTemplate


EDITOR_PROMPT = PromptTemplate(
    input_variables=[
        "keyword",
        "intent",
        "page_type",
        "original_text",
        "original_html_excerpt",
        "existing_images",
        "title",
        "recommendations",
        "custom_instructions",
    ],
    template="""You are an expert SEO content editor. Your job is to apply specific SEO optimizations to a page and output clean HTML.

Target keyword: {keyword}
Page intent: {intent}
Page type: {page_type}

CURRENT TITLE TAG:
{title}

RECOMMENDATIONS TO APPLY:
{recommendations}

ORIGINAL PAGE CONTENT:
{original_text}

ORIGINAL HTML EXCERPT:
{original_html_excerpt}

EXISTING IMAGE TAGS:
{existing_images}

CUSTOM OPTIMIZATION INSTRUCTIONS:
{custom_instructions}

Instructions:
- Apply ALL the listed recommendations to produce optimized content.
- CRITICAL: Maintain the page's intent and type. If it's a service page, keep it as a service page. If it's a blog, keep it as a blog. Do NOT change the page type.
- Output clean HTML that a dev team can directly use.
- Include these elements in order:
  1. A comment with the optimized <title> tag: <!-- TITLE: optimized title here -->
  2. A comment with the optimized meta description: <!-- META_DESCRIPTION: optimized description here -->
  3. The full optimized body content using proper HTML tags

For SERVICE/PRODUCT pages (transactional):
- Keep CTAs prominent and action-oriented
- Maintain trust signals (testimonials, certifications)
- Keep service/product descriptions benefit-focused
- Include contact or inquiry sections
- Use persuasive, professional tone

For BLOG posts (informational):
- Use comprehensive heading hierarchy
- Include detailed explanations
- Add FAQ sections where recommended
- Use educational, authoritative tone

For ALL pages:
- Use <h1> for main heading (only one), <h2> for sections, <h3> for sub-sections
- Use <p> for paragraphs, <ul>/<li> for lists
- Use <strong> for important keywords (sparingly)
- Preserve meaningful existing images from the original page whenever possible.
- Keep existing image URLs and attributes when preserving images (src, srcset, alt, width, height, loading, decoding).
- Do not invent new remote image URLs unless explicitly requested by custom instructions.
- Preserve the original tone — optimize, don't rewrite from scratch
- Naturally incorporate the target keyword
- Do NOT include <html>, <head>, <body>, or <style> tags
- Do NOT wrap output in markdown code fences
- Output ONLY the HTML content"""
)


def _truncate(text: str, max_chars: int = 8000) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n[... truncated ...]"


def _extract_image_tags(source_html: str, limit: int = 30) -> str:
    if not source_html:
        return "No existing image tags detected."

    matches = re.findall(r"(?is)<img\b[^>]*>", source_html)
    if not matches:
        return "No existing image tags detected."

    normalized = []
    seen = set()
    for raw_tag in matches:
        compact = re.sub(r"\s+", " ", raw_tag).strip()
        if not compact:
            continue
        if compact in seen:
            continue
        seen.add(compact)
        normalized.append(f"- {_truncate(compact, 450)}")
        if len(normalized) >= limit:
            break

    return "\n".join(normalized) if normalized else "No existing image tags detected."


def _custom_instructions() -> str:
    value = (os.getenv("EDITOR_PROMPT_APPEND") or "").strip()
    return value or "None."


def run_editor(
    llm,
    keyword: str,
    original_text: str,
    title: str,
    audit: dict,
    intent_data: dict = None,
    original_html: str = "",
) -> str:
    """
    Run the Editor Agent to produce optimized HTML content.

    Args:
        llm:            LangChain LLM instance.
        keyword:        Target keyword.
        original_text:  Original page body text.
        original_html:  Source HTML used to preserve structural/media elements.
        title:          Current page title.
        audit:          Full audit result from seo_agent.
        intent_data:    Output of detect_intent().

    Returns:
        Optimized HTML string.
    """
    intent_data = intent_data or {}
    intent = intent_data.get("intent", "informational")
    page_type = intent_data.get("page_type", "service")

    # Format recommendations
    rec_lines = []

    title_options = audit.get("title_tag", {}).get("options", [])
    if title_options:
        rec_lines.append(f"TITLE: {title_options[0]}")

    meta_options = audit.get("meta_description", {}).get("options", [])
    if meta_options:
        rec_lines.append(f"META: {meta_options[0]}")

    headings_plan = audit.get("headings_plan", {})
    if headings_plan.get("recommended_h1"):
        rec_lines.append(f"H1: {headings_plan['recommended_h1']}")
    for item in headings_plan.get("outline", [])[:20]:
        rec_lines.append(
            f"HEADING [{item.get('tag', 'h2')}][{item.get('status', 'add')}]: "
            f"{item.get('text', '')} ({item.get('note', 'no note')})"
        )

    if audit.get("word_count", {}).get("recommendation"):
        rec_lines.append(f"WORD COUNT: {audit['word_count']['recommendation']}")

    if audit.get("keyword_usage", {}).get("recommendation"):
        rec_lines.append(f"KEYWORDS: {audit['keyword_usage']['recommendation']}")

    for gap in audit.get("content_gaps", []):
        rec_lines.append(f"CONTENT GAP: Add coverage of \"{gap}\"")

    for rec in sorted(audit.get("checklist", []), key=lambda x: x.get("priority", 999)):
        rec_lines.append(
            f"#{rec.get('priority', '-')}: {rec.get('task', '')} at {rec.get('location', '')}"
        )

    # Backward compatibility with older payload keys.
    if audit.get("title_tag", {}).get("recommendation"):
        rec_lines.append(f"TITLE: {audit['title_tag']['recommendation']}")
    if audit.get("meta_description", {}).get("recommendation"):
        rec_lines.append(f"META: {audit['meta_description']['recommendation']}")
    if audit.get("headings", {}).get("recommendation"):
        rec_lines.append(f"HEADINGS: {audit['headings']['recommendation']}")
    for rec in audit.get("recommendations", []):
        rec_lines.append(
            f"#{rec.get('priority', '-')} [{rec.get('type', '')}]: {rec.get('action', '')}"
        )

    recommendations_str = "\n".join(rec_lines) if rec_lines else "No specific recommendations."

    chain = EDITOR_PROMPT | llm
    result = chain.invoke({
        "keyword": keyword,
        "intent": intent,
        "page_type": page_type,
        "original_text": _truncate(original_text, 6000),
        "original_html_excerpt": _truncate(original_html, 8000),
        "existing_images": _extract_image_tags(original_html, limit=40),
        "title": title or "(no title)",
        "recommendations": recommendations_str,
        "custom_instructions": _custom_instructions(),
    })

    html = result.content.strip()

    if html.startswith("```html"):
        html = html[7:]
    if html.startswith("```"):
        html = html[3:]
    if html.endswith("```"):
        html = html[:-3]

    return html.strip()
