"""
SEO Audit Agent — uses LangChain + Groq/Claude to produce
a structured on-page SEO audit, tailored to the page's intent.
"""
import json

from langchain_core.prompts import PromptTemplate

AUDIT_PROMPT = PromptTemplate(
    input_variables=["keyword", "intent", "page_type", "industry", "your_page", "serp_summary", "gaps"],
    template="""You are an expert SEO on-page auditor.

Target keyword: {keyword}
Page intent: {intent}
Page type: {page_type}
Industry: {industry}

YOUR PAGE DATA:
{your_page}

SERP TOP-10 COMPETITOR SUMMARY:
{serp_summary}

COMPUTED GAPS:
{gaps}

INTENT-SPECIFIC AUDIT CRITERIA:

If TRANSACTIONAL (service_page, product_page, landing_page):
- Does the page have clear CTAs (call-to-action)?
- Are there trust signals (testimonials, reviews, certifications, case studies)?
- Is pricing or service packaging mentioned?
- Is there clear contact info or a lead form?
- Are service/product benefits clearly articulated?
- Does the page address objections or FAQs?

If INFORMATIONAL (blog_post):
- Is the content comprehensive and in-depth?
- Does it have proper heading hierarchy for scannability?
- Are there internal links to related content?
- Does it include FAQ or "People Also Ask" sections?
- Is readability appropriate for the audience?

If COMMERCIAL (category_page, comparison):
- Are there comparison elements (tables, pros/cons)?
- Are products/services clearly categorized?
- Are there reviews or ratings?
- Is pricing information present?

Perform a full on-page SEO audit appropriate for this page type. Return ONLY valid JSON:
{{
  "overall_score": <int 0-100>,
  "detected_intent": "{intent}",
  "detected_page_type": "{page_type}",
  "title_tag": {{
    "current": "<current title>",
    "status": "ok|needs_improvement|missing",
    "recommendation": "<specific suggestion>"
  }},
  "meta_description": {{
    "status": "ok|needs_improvement|missing",
    "recommendation": "<specific suggestion>"
  }},
  "headings": {{
    "h1_count": <int>,
    "h2_count": <int>,
    "status": "ok|low|missing",
    "recommendation": "<specific suggestion>"
  }},
  "word_count": {{
    "yours": <int>,
    "serp_avg": <int>,
    "serp_top": <int>,
    "status": "ok|low|very_low",
    "recommendation": "<specific suggestion>"
  }},
  "keyword_usage": {{
    "density_yours": <float>,
    "density_serp_avg": <float>,
    "status": "ok|low|high",
    "recommendation": "<specific suggestion>"
  }},
  "content_gaps": [
    "<specific missing topic, element, or section>"
  ],
  "strengths": [
    "<what the page does well>"
  ],
  "recommendations": [
    {{
      "priority": <int 1-8>,
      "type": "title|meta|heading|content|keyword|structure|cta|trust|pricing",
      "action": "<exactly what to do>",
      "rationale": "<why this matters for ranking>"
    }}
  ]
}}

IMPORTANT: Tailor your recommendations to the page type. A service page needs CTAs and trust signals, not "add more blog content". A blog needs depth and structure, not "add pricing".

Return ONLY the JSON object. No markdown fences, no explanation."""
)


def _truncate(text: str, max_chars: int = 8000) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n[... truncated ...]"


def run_seo_audit(llm, keyword: str, your_page: dict, competitor_pages: list[dict], gaps: dict, intent_data: dict = None) -> dict:
    """
    Run the full SEO audit agent.

    Args:
        llm:              LangChain LLM instance.
        keyword:          Target keyword.
        your_page:        Scraped + analyzed data for user's page.
        competitor_pages: List of scraped + analyzed competitor pages.
        gaps:             Output of compute_gaps().
        intent_data:      Output of detect_intent() — intent, page_type, industry.

    Returns:
        Structured audit dict.
    """
    intent_data = intent_data or {}
    intent = intent_data.get("intent", "informational")
    page_type = intent_data.get("page_type", "blog_post")
    industry = intent_data.get("industry", "general")

    # Format competitor summary
    serp_lines = []
    for i, p in enumerate(competitor_pages[:10], 1):
        serp_lines.append(
            f"[{i}] {p.get('url', '')} | WC:{p.get('word_count', 0)} | "
            f"H2s:{len(p.get('headings', []))} | KW density:{p.get('keyword_density', 0)}%"
        )
    serp_summary = "\n".join(serp_lines) or "No competitor data available."

    # Format your page data
    headings = your_page.get("headings", [])
    h2_list = [h["text"] for h in headings if h.get("tag") == "h2"]
    your_page_str = (
        f"URL: {your_page.get('url', '')}\n"
        f"Title: {your_page.get('title', '')}\n"
        f"H1: {next((h['text'] for h in headings if h.get('tag') == 'h1'), 'None')}\n"
        f"H2s: {', '.join(h2_list) or 'None'}\n"
        f"Word count: {your_page.get('word_count', 0)}\n"
        f"Keyword density: {your_page.get('keyword_density', 0)}%\n"
        f"Top keywords: {', '.join(your_page.get('top_keywords', []))}\n"
        f"Entities found: {', '.join(your_page.get('entities', [])[:15])}"
    )

    gaps_str = json.dumps(gaps, indent=2)

    chain = AUDIT_PROMPT | llm
    result = chain.invoke({
        "keyword": keyword,
        "intent": intent,
        "page_type": page_type,
        "industry": industry,
        "your_page": _truncate(your_page_str, 3000),
        "serp_summary": _truncate(serp_summary, 2000),
        "gaps": _truncate(gaps_str, 1500),
    })

    raw = result.content

    try:
        clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        return json.loads(clean)
    except json.JSONDecodeError:
        return {"raw_output": raw, "parse_error": True, "overall_score": 0}
