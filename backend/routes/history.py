"""
GET /api/history — List past optimization jobs with filters.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from scrapling_core.models import OptimizationJob

router = APIRouter()


class HistoryItem(BaseModel):
    id: int
    url: str
    keyword: str
    status: str
    detected_intent: Optional[str] = None
    page_type: Optional[str] = None
    audit_result: Optional[str] = None
    competitor_urls: Optional[str] = None
    has_export: bool = False
    created_at: str
    finished_at: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/history", response_model=list[HistoryItem])
def list_history(
    status: Optional[str] = Query(None, description="Filter by status"),
    keyword: Optional[str] = Query(None, description="Filter by keyword (partial match)"),
    url: Optional[str] = Query(None, description="Filter by URL (partial match)"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """List optimization jobs with optional filters."""
    query = db.query(OptimizationJob)

    if status:
        query = query.filter(OptimizationJob.status == status)
    if keyword:
        query = query.filter(OptimizationJob.keyword.contains(keyword))
    if url:
        query = query.filter(OptimizationJob.url.contains(url))

    jobs = query.order_by(OptimizationJob.created_at.desc()).limit(limit).all()

    return [
        HistoryItem(
            id=j.id,
            url=j.url,
            keyword=j.keyword or "",
            status=j.status,
            detected_intent=j.detected_intent,
            page_type=j.page_type,
            audit_result=j.audit_result,
            competitor_urls=j.competitor_urls,
            has_export=bool(j.optimized_html),
            created_at=j.created_at.isoformat() if j.created_at else "",
            finished_at=j.finished_at.isoformat() if j.finished_at else None,
        )
        for j in jobs
    ]


@router.get("/history/{job_id}", response_model=HistoryItem)
def get_job(job_id: int, db: Session = Depends(get_db)):
    """Get a single optimization job by ID."""
    job = db.query(OptimizationJob).filter(OptimizationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return HistoryItem(
        id=job.id,
        url=job.url,
        keyword=job.keyword or "",
        status=job.status,
        audit_result=job.audit_result,
        competitor_urls=job.competitor_urls,
        has_export=bool(job.optimized_html),
        created_at=job.created_at.isoformat() if job.created_at else "",
        finished_at=job.finished_at.isoformat() if job.finished_at else None,
    )
