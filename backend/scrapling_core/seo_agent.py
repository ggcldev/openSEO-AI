"""
SEO Audit Agent — generates a full Optimization Pack
tailored to page type, region, language, and goal.
"""
import json
from typing import Optional

from langchain_core.prompts import PromptTemplate

from scrapling_core.llm_runtime import invoke_chain_with_retry
from scrapling_core.style_profile import format_style_profile

AUDIT_PROMPT = PromptTemplate(
    input_variables=[
        "keyword",
        "page_type",
        "intent",
        "industry",
        "region",
        "language",
        "goal",
        "your_page",
        "serp_summary",
        "gaps",
        "style_profile",
        "geo_aeo_baseline",
    ],
    template="""You are an expert SEO on-page optimizer for Hitachi Energy.

Target keyword: {keyword}
Page type: {page_type}
Intent: {intent}
Industry: {industry}
Region: {region}
Language: {language}
Goal: {goal}

YOUR PAGE DATA:
{your_page}

SERP TOP-10 COMPETITOR SUMMARY:
{serp_summary}

COMPUTED GAPS:
{gaps}

STYLE PROFILE TO PRESERVE:
{style_profile}

GEO/AEO BASELINE SIGNALS:
{geo_aeo_baseline}

Generate a complete Optimization Pack. Return ONLY valid JSON:
{{
  "overall_score": <int 0-100>,
  "priority_action": "optimize_now|optimize_later|no_change",
  "effort_level": "low|medium|high",

  "keywords": {{
    "primary": "<primary keyword>",
    "secondary": ["<supporting keyword 1>", "<supporting keyword 2>", "<supporting keyword 3>"],
    "intent_cluster": "<informational|commercial|transactional>"
  }},

  "title_tag": {{
    "current": "<current title>",
    "options": ["<title option 1>", "<title option 2>", "<title option 3>"]
  }},

  "meta_description": {{
    "options": ["<meta desc option 1>", "<meta desc option 2>", "<meta desc option 3>"]
  }},

  "headings_plan": {{
    "recommended_h1": "<recommended H1>",
    "outline": [
      {{"tag": "h2", "text": "<section heading>", "status": "keep|add|rewrite", "note": "<why>"}},
      {{"tag": "h3", "text": "<sub-section>", "status": "keep|add|rewrite", "note": "<why>"}}
    ]
  }},

  "faq_pack": [
    {{"question": "<question 1>", "answer": "<concise answer>"}},
    {{"question": "<question 2>", "answer": "<concise answer>"}}
  ],

  "word_count": {{
    "yours": <int>,
    "serp_avg": <int>,
    "serp_top": <int>,
    "recommendation": "<specific suggestion>"
  }},

  "content_gaps": ["<missing topic 1>", "<missing topic 2>"],
  "strengths": ["<what the page does well>"],

  "change_summary": {{
    "keep": ["<what to keep as-is>"],
    "change": ["<what to change and why>"]
  }},

  "style_guardrails": {{
    "voice": "<voice label to preserve>",
    "formality": "<formal|balanced|conversational>",
    "do": ["<style behavior to preserve>"],
    "avoid": ["<style drift to avoid>"]
  }},

  "geo_aeo": {{
    "readiness_score": <int 0-100>,
    "answer_blocks": [
      {{"question": "<query-style question>", "answer": "<40-70 word concise answer>", "placement": "<section/heading target>"}}
    ],
    "priority_fixes": ["<AEO/GEO fix 1>", "<AEO/GEO fix 2>"],
    "entity_expansions": ["<entity to add or clarify>"],
    "schema_recommendations": ["<FAQPage|HowTo|Product|Service etc with rationale>"]
  }},

  "checklist": [
    {{"task": "<specific edit to make>", "location": "<where on the page>", "priority": <1-8>}}
  ]
}}

TEMPLATE BY PAGE TYPE:
- Service page: problem → approach/solution → deliverables/benefits → proof/case studies → FAQ → CTA
- Product page: what it is → key specs/benefits → applications → proof → FAQ
- Landing page: value proposition → key benefits → proof/social proof → FAQ → CTA

Generate 6-10 FAQs relevant to the page topic and intent.
Generate 3 title options and 3 meta description options.
Generate a complete headings outline following the template for this page type.
For GEO/AEO, generate direct-answer blocks and query-style Q/A phrasing that can rank in AI/answer engines.
Preserve the source voice; optimize in place rather than proposing a full rewrite.
Checklist should have 5-8 specific, actionable edits.

Return ONLY the JSON. No markdown fences, no explanation."""
)


def _truncate(text: str, max_chars: int = 8000) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n[... truncated ...]"


def _build_geo_aeo_baseline(your_page: dict, competitor_pages: list[dict], gaps: dict) -> dict:
    headings = your_page.get("headings", []) or []
    question_headings = [
        h.get("text", "")
        for h in headings
        if isinstance(h, dict) and "?" in str(h.get("text", ""))
    ]
    question_ratio = round(len(question_headings) / max(len(headings), 1), 2)
    faq_guess = len(question_headings)
    competitor_entities: set[str] = set()
    for page in competitor_pages:
        for entity in page.get("entities", []) or []:
            if isinstance(entity, str) and entity.strip():
                competitor_entities.add(entity.strip())

    return {
        "question_heading_ratio": question_ratio,
        "existing_question_heading_count": faq_guess,
        "word_count": your_page.get("word_count", 0),
        "missing_entities_count": len((gaps or {}).get("missing_entities", []) or []),
        "top_missing_entities": ((gaps or {}).get("missing_entities", []) or [])[:10],
        "top_competitor_entities": sorted(competitor_entities)[:12],
    }


def run_seo_audit(
    llm, keyword: str, your_page: dict, competitor_pages: list[dict],
    gaps: dict, intent_data: dict = None,
    region: str = "global", language: str = "en", goal: str = "leads",
    style_profile: Optional[dict] = None,
) -> dict:
    intent_data = intent_data or {}
    intent = intent_data.get("intent", "informational")
    page_type = intent_data.get("page_type", "service")
    industry = intent_data.get("industry", "energy")

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
        f"Entities: {', '.join(your_page.get('entities', [])[:15])}"
    )
    geo_aeo_baseline = _build_geo_aeo_baseline(your_page, competitor_pages, gaps)

    chain = AUDIT_PROMPT | llm
    raw = invoke_chain_with_retry(
        chain,
        {
            "keyword": keyword,
            "page_type": page_type,
            "intent": intent,
            "industry": industry,
            "region": region,
            "language": language,
            "goal": goal,
            "your_page": _truncate(your_page_str, 3000),
            "serp_summary": _truncate(serp_summary, 2000),
            "gaps": _truncate(json.dumps(gaps, indent=2), 1500),
            "style_profile": _truncate(format_style_profile(style_profile), 1500),
            "geo_aeo_baseline": _truncate(json.dumps(geo_aeo_baseline, indent=2), 1200),
        },
        stage="seo_audit",
    )
    try:
        clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        return json.loads(clean)
    except json.JSONDecodeError:
        return {"raw_output": raw, "parse_error": True, "overall_score": 0}
