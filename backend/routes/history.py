"""
GET /api/history — List past scrape jobs with filters.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from scrapling_core.models import ScrapeJob

router = APIRouter()


class HistoryItem(BaseModel):
    id: int
    url: str
    agent: str
    status: str
    result: Optional[str] = None
    created_at: str
    finished_at: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/history", response_model=list[HistoryItem])
def list_history(
    status: Optional[str] = Query(None, description="Filter by status: pending, running, done, failed"),
    agent: Optional[str] = Query(None, description="Filter by agent type"),
    url: Optional[str] = Query(None, description="Filter by URL (partial match)"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """List scrape jobs with optional filters."""
    query = db.query(ScrapeJob)

    if status:
        query = query.filter(ScrapeJob.status == status)
    if agent:
        query = query.filter(ScrapeJob.agent == agent)
    if url:
        query = query.filter(ScrapeJob.url.contains(url))

    jobs = query.order_by(ScrapeJob.created_at.desc()).limit(limit).all()

    return [
        HistoryItem(
            id=j.id,
            url=j.url,
            agent=j.agent,
            status=j.status,
            result=j.result,
            created_at=j.created_at.isoformat() if j.created_at else "",
            finished_at=j.finished_at.isoformat() if j.finished_at else None,
        )
        for j in jobs
    ]


@router.get("/history/{job_id}", response_model=HistoryItem)
def get_job(job_id: int, db: Session = Depends(get_db)):
    """Get a single scrape job by ID."""
    job = db.query(ScrapeJob).filter(ScrapeJob.id == job_id).first()
    if not job:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Job not found")

    return HistoryItem(
        id=job.id,
        url=job.url,
        agent=job.agent,
        status=job.status,
        result=job.result,
        created_at=job.created_at.isoformat() if job.created_at else "",
        finished_at=job.finished_at.isoformat() if job.finished_at else None,
    )
