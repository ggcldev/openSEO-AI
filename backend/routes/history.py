"""
GET /api/history — List past optimization jobs.
"""
import json
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
    goal: Optional[str] = None
    num_competitors: Optional[int] = None
    pipeline_mode: Optional[str] = None
    status: str
    detected_intent: Optional[str] = None
    page_type: Optional[str] = None
    region: Optional[str] = None
    language: Optional[str] = None
    error_stage: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    audit_result: Optional[str] = None
    has_source_html: bool = False
    has_export: bool = False
    can_optimize: bool = False
    created_at: str
    finished_at: Optional[str] = None

    class Config:
        from_attributes = True


def _to_item(j: OptimizationJob) -> HistoryItem:
    can_optimize = bool(j.source_html) and bool(j.audit_result) and j.status not in ("pending", "running")
    if can_optimize:
        try:
            audit_payload = json.loads(j.audit_result or "{}")
            if isinstance(audit_payload, dict) and audit_payload.get("parse_error"):
                can_optimize = False
        except Exception:
            can_optimize = False
    return HistoryItem(
        id=j.id, url=j.url, keyword=j.keyword or "",
        goal=j.goal, num_competitors=j.num_competitors, pipeline_mode=j.pipeline_mode or "full", status=j.status,
        detected_intent=j.detected_intent, page_type=j.page_type,
        region=j.region, language=j.language,
        error_stage=j.error_stage,
        error_code=j.error_code,
        error_message=j.error_message,
        audit_result=j.audit_result,
        has_source_html=bool(j.source_html),
        has_export=bool(j.optimized_html),
        can_optimize=can_optimize,
        created_at=j.created_at.isoformat() if j.created_at else "",
        finished_at=j.finished_at.isoformat() if j.finished_at else None,
    )


@router.get("/history", response_model=list[HistoryItem])
def list_history(
    status: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    url: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(OptimizationJob)
    if status:
        query = query.filter(OptimizationJob.status == status)
    if keyword:
        query = query.filter(OptimizationJob.keyword.ilike(f"%{keyword}%"))
    if url:
        query = query.filter(OptimizationJob.url.ilike(f"%{url}%"))
    return [_to_item(j) for j in query.order_by(OptimizationJob.created_at.desc()).limit(limit).all()]


@router.get("/history/{job_id}", response_model=HistoryItem)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(OptimizationJob).filter(OptimizationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _to_item(job)
