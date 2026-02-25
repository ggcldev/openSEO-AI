"""
Intent Detector — classifies a page's search intent and type
before running the SEO audit. This ensures the audit, SERP query,
and editor all tailor their output to the correct page type.
"""
import json

from langchain_core.prompts import PromptTemplate


INTENT_PROMPT = PromptTemplate(
    input_variables=["url", "title", "headings", "body_snippet"],
    template="""You are an SEO expert. Analyze this page and classify its search intent and type.

URL: {url}
TITLE: {title}
HEADINGS: {headings}
CONTENT SNIPPET: {body_snippet}

Return ONLY valid JSON:
{{
  "intent": "<transactional|informational|commercial|navigational>",
  "page_type": "<service_page|product_page|blog_post|landing_page|about_page|category_page|homepage>",
  "industry": "<detected industry or niche, e.g. 'renewable energy', 'digital marketing'>",
  "serp_query": "<the best Google search query to find competing pages of the SAME TYPE and intent, not blog posts about the topic>"
}}

Guidelines for serp_query:
- If it's a service page for "web design" → search "web design services" or "web design agency"
- If it's a product page for a CRM → search "CRM software" or "best CRM tools"
- If it's a blog post about SEO tips → search "SEO tips" or "SEO guide"
- The goal is to find pages that are DIRECT COMPETITORS in format and intent.

Return ONLY the JSON. No explanation."""
)


def detect_intent(llm, page_data: dict) -> dict:
    """
    Detect the search intent and page type from scraped page data.

    Args:
        llm:        LangChain LLM instance.
        page_data:  Scraped page dict with url, title, headings, body_text.

    Returns:
        Dict with intent, page_type, industry, serp_query.
        Falls back to defaults on parse error.
    """
    headings = page_data.get("headings", [])
    headings_str = ", ".join(
        f"[{h.get('tag', '')}] {h.get('text', '')}" for h in headings[:15]
    ) or "None"

    body = page_data.get("body_text", "")
    body_snippet = body[:1500] if body else "(empty)"

    chain = INTENT_PROMPT | llm
    result = chain.invoke({
        "url": page_data.get("url", ""),
        "title": page_data.get("title", "(no title)"),
        "headings": headings_str,
        "body_snippet": body_snippet,
    })

    raw = result.content.strip()

    try:
        clean = raw.lstrip("```json").lstrip("```").rstrip("```").strip()
        parsed = json.loads(clean)
        return {
            "intent": parsed.get("intent", "informational"),
            "page_type": parsed.get("page_type", "blog_post"),
            "industry": parsed.get("industry", ""),
            "serp_query": parsed.get("serp_query", ""),
        }
    except (json.JSONDecodeError, AttributeError):
        return {
            "intent": "informational",
            "page_type": "blog_post",
            "industry": "",
            "serp_query": "",
        }
