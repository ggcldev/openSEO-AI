"""
GET /api/history — List past optimization jobs.
"""
import json
from typing import Any, Optional

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


def _compute_can_optimize(
    *,
    status: str,
    has_source_html: bool,
    has_audit_result: bool,
    audit_result: Optional[str],
    include_audit: bool,
) -> bool:
    can_optimize = has_source_html and has_audit_result and status not in ("pending", "running")
    if include_audit and can_optimize and audit_result:
        try:
            audit_payload = json.loads(audit_result)
            if isinstance(audit_payload, dict) and audit_payload.get("parse_error"):
                can_optimize = False
        except Exception:
            can_optimize = False
    return can_optimize


def _to_item(j: OptimizationJob, *, include_audit: bool = True) -> HistoryItem:
    has_source_html = bool(j.source_html)
    has_export = bool(j.optimized_html)
    has_audit_result = bool(j.audit_result)
    audit_result = j.audit_result if include_audit else None
    can_optimize = _compute_can_optimize(
        status=j.status,
        has_source_html=has_source_html,
        has_audit_result=has_audit_result,
        audit_result=audit_result,
        include_audit=include_audit,
    )
    return HistoryItem(
        id=j.id, url=j.url, keyword=j.keyword or "",
        goal=j.goal, num_competitors=j.num_competitors, pipeline_mode=j.pipeline_mode or "full", status=j.status,
        detected_intent=j.detected_intent, page_type=j.page_type,
        region=j.region, language=j.language,
        error_stage=j.error_stage,
        error_code=j.error_code,
        error_message=j.error_message,
        audit_result=audit_result,
        has_source_html=has_source_html,
        has_export=has_export,
        can_optimize=can_optimize,
        created_at=j.created_at.isoformat() if j.created_at else "",
        finished_at=j.finished_at.isoformat() if j.finished_at else None,
    )


def _row_to_item(row: Any, *, include_audit: bool) -> HistoryItem:
    mapping = row._mapping
    has_source_html = bool(mapping["has_source_html"])
    has_export = bool(mapping["has_export"])
    has_audit_result = bool(mapping["has_audit_result"])
    audit_result = mapping["audit_result"] if include_audit else None
    can_optimize = _compute_can_optimize(
        status=mapping["status"],
        has_source_html=has_source_html,
        has_audit_result=has_audit_result,
        audit_result=audit_result,
        include_audit=include_audit,
    )
    return HistoryItem(
        id=mapping["id"], url=mapping["url"], keyword=mapping["keyword"] or "",
        goal=mapping["goal"], num_competitors=mapping["num_competitors"],
        pipeline_mode=mapping["pipeline_mode"] or "full", status=mapping["status"],
        detected_intent=mapping["detected_intent"], page_type=mapping["page_type"],
        region=mapping["region"], language=mapping["language"],
        error_stage=mapping["error_stage"],
        error_code=mapping["error_code"],
        error_message=mapping["error_message"],
        audit_result=audit_result,
        has_source_html=has_source_html,
        has_export=has_export,
        can_optimize=can_optimize,
        created_at=mapping["created_at"].isoformat() if mapping["created_at"] else "",
        finished_at=mapping["finished_at"].isoformat() if mapping["finished_at"] else None,
    )


@router.get("/history", response_model=list[HistoryItem])
def list_history(
    status: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    url: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    include_audit: bool = Query(False),
    db: Session = Depends(get_db),
):
    selected_fields = [
        OptimizationJob.id.label("id"),
        OptimizationJob.url.label("url"),
        OptimizationJob.keyword.label("keyword"),
        OptimizationJob.goal.label("goal"),
        OptimizationJob.num_competitors.label("num_competitors"),
        OptimizationJob.pipeline_mode.label("pipeline_mode"),
        OptimizationJob.status.label("status"),
        OptimizationJob.detected_intent.label("detected_intent"),
        OptimizationJob.page_type.label("page_type"),
        OptimizationJob.region.label("region"),
        OptimizationJob.language.label("language"),
        OptimizationJob.error_stage.label("error_stage"),
        OptimizationJob.error_code.label("error_code"),
        OptimizationJob.error_message.label("error_message"),
        OptimizationJob.created_at.label("created_at"),
        OptimizationJob.finished_at.label("finished_at"),
        OptimizationJob.source_html.isnot(None).label("has_source_html"),
        OptimizationJob.optimized_html.isnot(None).label("has_export"),
        OptimizationJob.audit_result.isnot(None).label("has_audit_result"),
    ]
    if include_audit:
        selected_fields.append(OptimizationJob.audit_result.label("audit_result"))

    query = db.query(*selected_fields)
    if status:
        query = query.filter(OptimizationJob.status == status)
    if keyword:
        query = query.filter(OptimizationJob.keyword.ilike(f"%{keyword}%"))
    if url:
        query = query.filter(OptimizationJob.url.ilike(f"%{url}%"))
    rows = query.order_by(OptimizationJob.created_at.desc()).limit(limit).all()
    return [_row_to_item(row, include_audit=include_audit) for row in rows]


@router.get("/history/{job_id}", response_model=HistoryItem)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(OptimizationJob).filter(OptimizationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _to_item(job, include_audit=True)
