"""
POST /api/scrape — Submit a new scrape job.
"""
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl
from sqlalchemy.orm import Session

from database import get_db
from scrapling_core.models import ScrapeJob
from scrapling_core.engine import run_scrape

router = APIRouter()


class ScrapeRequest(BaseModel):
    url: HttpUrl
    agent: str = "summarize"  # summarize | extract | raw
    config: dict = {}


class ScrapeResponse(BaseModel):
    id: int
    url: str
    agent: str
    status: str
    message: str


@router.post("/scrape", response_model=ScrapeResponse)
async def submit_scrape(req: ScrapeRequest, db: Session = Depends(get_db)):
    """Submit a new scrape job. Runs async in background."""
    job = ScrapeJob(
        url=str(req.url),
        agent=req.agent,
        config=str(req.config),
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Run scrape in background
    asyncio.create_task(_process_scrape(job.id, str(req.url), req.agent, req.config))

    return ScrapeResponse(
        id=job.id,
        url=job.url,
        agent=job.agent,
        status="pending",
        message="Scrape job submitted. Check /api/history for results.",
    )


async def _process_scrape(job_id: int, url: str, agent: str, config: dict):
    """Background task to run the scrape and update the DB."""
    from database import SessionLocal

    db = SessionLocal()
    try:
        job = db.query(ScrapeJob).filter(ScrapeJob.id == job_id).first()
        if not job:
            return

        job.status = "running"
        db.commit()

        result = await asyncio.to_thread(run_scrape, url, agent, config)

        job.status = "done"
        job.result = str(result)
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        job.status = "failed"
        job.result = str(e)
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()
