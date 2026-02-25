"""
POST /api/optimize — Submit an SEO optimization job.
"""
import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, HttpUrl
from sqlalchemy.orm import Session

from database import get_db
from scrapling_core.models import OptimizationJob

router = APIRouter()


class OptimizeRequest(BaseModel):
    url: HttpUrl
    keyword: str = ""
    goal: str = "leads"
    num_competitors: int = 10


class OptimizeResponse(BaseModel):
    id: int
    url: str
    keyword: str
    status: str
    message: str


@router.post("/optimize", response_model=OptimizeResponse)
async def submit_optimization(req: OptimizeRequest, db: Session = Depends(get_db)):
    job = OptimizationJob(
        url=str(req.url),
        keyword=req.keyword or "",
        goal=req.goal,
        num_competitors=req.num_competitors,
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    asyncio.create_task(_run_optimization(
        job.id, str(req.url), req.keyword, req.goal, req.num_competitors,
    ))

    return OptimizeResponse(
        id=job.id, url=job.url, keyword=job.keyword,
        status="pending", message="Optimization job submitted.",
    )


async def _run_optimization(
    job_id: int, url: str, keyword: str, goal: str, num_competitors: int,
):
    from database import SessionLocal

    db = SessionLocal()
    try:
        job = db.query(OptimizationJob).filter(OptimizationJob.id == job_id).first()
        if not job:
            return

        job.status = "running"
        db.commit()

        result = await asyncio.to_thread(
            _run_pipeline, url, keyword, goal, num_competitors,
        )

        intent_data = result.get("intent_data", {})
        job.status = "done"
        job.detected_intent = intent_data.get("intent", "")
        job.page_type = intent_data.get("page_type", "")
        job.region = intent_data.get("region", "")
        job.language = intent_data.get("language", "")
        job.audit_result = json.dumps(result.get("audit", {}), ensure_ascii=False)
        job.optimized_html = result.get("optimized_html", "")
        job.competitor_urls = json.dumps(result.get("competitor_urls", []))
        job.finished_at = datetime.now(timezone.utc)
        db.commit()

    except Exception as e:
        job.status = "failed"
        job.audit_result = json.dumps({"error": str(e)})
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


def _run_pipeline(url: str, keyword: str, goal: str, num_competitors: int) -> dict:
    from scrapling_core.engine import scrape_page, scrape_pages_parallel
    from scrapling_core.serp import get_serp_urls
    from scrapling_core.analyzer import analyze_content, compute_gaps
    from scrapling_core.intent_detector import detect_intent
    from scrapling_core.seo_agent import run_seo_audit
    from scrapling_core.editor_agent import run_editor
    from config import get_llm

    llm = get_llm()

    # 1. Scrape
    your_page = scrape_page(url)

    # 2. Auto-detect intent, page type, region, language
    intent_data = detect_intent(llm, your_page)

    # 3. SERP
    competitor_urls = []
    serp_query = intent_data.get("serp_query") or keyword
    if serp_query:
        try:
            serp_urls = get_serp_urls(serp_query, num=num_competitors + 2)
            competitor_urls = [u for u in serp_urls if url not in u][:num_competitors]
        except Exception:
            competitor_urls = []

    # 4. Scrape competitors
    competitor_pages = scrape_pages_parallel(competitor_urls) if competitor_urls else []

    # 5. Analyze
    effective_keyword = keyword or intent_data.get("industry", "")
    your_analysis = {**your_page, **analyze_content(your_page.get("body_text", ""), effective_keyword)}
    competitor_analyses = [
        {**page, **analyze_content(page.get("body_text", ""), effective_keyword)}
        for page in competitor_pages
    ]
    gaps = compute_gaps(your_analysis, competitor_analyses)

    # 6. Optimization Pack
    audit = run_seo_audit(
        llm, keyword=effective_keyword or "(auto-detected)",
        your_page=your_analysis, competitor_pages=competitor_analyses,
        gaps=gaps, intent_data=intent_data,
        region=intent_data.get("region", "global"),
        language=intent_data.get("language", "en"),
        goal=goal,
    )

    # 7. Optimized HTML
    optimized_html = ""
    if not audit.get("parse_error"):
        try:
            optimized_html = run_editor(
                llm, keyword=effective_keyword or "(auto-detected)",
                original_text=your_page.get("body_text", ""),
                title=your_page.get("title", ""),
                audit=audit, intent_data=intent_data,
            )
        except Exception:
            optimized_html = ""

    return {
        "audit": audit, "optimized_html": optimized_html,
        "competitor_urls": competitor_urls, "intent_data": intent_data, "gaps": gaps,
    }
