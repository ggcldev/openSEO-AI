"""
Editor Agent — rewrites page content based on SEO audit recommendations.
Outputs clean, optimized HTML tailored to the page's intent type.
"""
from langchain_core.prompts import PromptTemplate


EDITOR_PROMPT = PromptTemplate(
    input_variables=["keyword", "intent", "page_type", "original_text", "title", "recommendations"],
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


def run_editor(llm, keyword: str, original_text: str, title: str, audit: dict, intent_data: dict = None) -> str:
    """
    Run the Editor Agent to produce optimized HTML content.

    Args:
        llm:            LangChain LLM instance.
        keyword:        Target keyword.
        original_text:  Original page body text.
        title:          Current page title.
        audit:          Full audit result from seo_agent.
        intent_data:    Output of detect_intent().

    Returns:
        Optimized HTML string.
    """
    intent_data = intent_data or {}
    intent = intent_data.get("intent", "informational")
    page_type = intent_data.get("page_type", "blog_post")

    # Format recommendations
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
        "intent": intent,
        "page_type": page_type,
        "original_text": _truncate(original_text, 6000),
        "title": title or "(no title)",
        "recommendations": recommendations_str,
    })

    html = result.content.strip()

    if html.startswith("```html"):
        html = html[7:]
    if html.startswith("```"):
        html = html[3:]
    if html.endswith("```"):
        html = html[:-3]

    return html.strip()
