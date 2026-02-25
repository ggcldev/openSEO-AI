"""
Intent Detector — classifies page intent, type, region, and language.
"""
import json

from langchain_core.prompts import PromptTemplate


INTENT_PROMPT = PromptTemplate(
    input_variables=["url", "title", "headings", "body_snippet"],
    template="""You are an SEO expert. Analyze this page and classify it.

URL: {url}
TITLE: {title}
HEADINGS: {headings}
CONTENT SNIPPET: {body_snippet}

Return ONLY valid JSON:
{{
  "intent": "<transactional|informational|commercial|navigational>",
  "page_type": "<service|product|landing>",
  "industry": "<detected industry or niche>",
  "region": "<global|apac|emea|nam|latam>",
  "language": "<en|de|fr|es|pt|zh|ja>",
  "serp_query": "<best Google query to find competing pages of the SAME type and intent>"
}}

Rules:
- page_type: "service" for service/solution pages, "product" for product pages, "landing" for general landing/market pages
- region: detect from URL path (e.g. /us/ = nam, /de/ = emea, /cn/ = apac), domain TLD, or content. Default "global" if unclear.
- language: detect from content language. Default "en" if unclear.
- serp_query: find DIRECT COMPETITORS in format and intent, not blog posts about the topic.

Return ONLY the JSON."""
)


def detect_intent(llm, page_data: dict) -> dict:
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
            "page_type": parsed.get("page_type", "service"),
            "industry": parsed.get("industry", ""),
            "region": parsed.get("region", "global"),
            "language": parsed.get("language", "en"),
            "serp_query": parsed.get("serp_query", ""),
        }
    except (json.JSONDecodeError, AttributeError):
        return {
            "intent": "informational",
            "page_type": "service",
            "industry": "",
            "region": "global",
            "language": "en",
            "serp_query": "",
        }
