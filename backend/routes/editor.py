"""
Editor routes for retrieving and updating stored HTML artifacts.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from job_service import _extract_editor_context_html
from scrapling_core.models import OptimizationJob

router = APIRouter()


class EditorDocument(BaseModel):
    id: int
    url: str
    status: str
    source_html: Optional[str] = None
    optimized_html: Optional[str] = None
    created_at: str
    finished_at: Optional[str] = None


class EditorUpdateRequest(BaseModel):
    optimized_html: str = Field(min_length=1)


def _to_editor_document(job: OptimizationJob) -> EditorDocument:
    source_html = job.source_html or ""
    editor_source_html = _extract_editor_context_html(source_html) or source_html
    return EditorDocument(
        id=job.id,
        url=job.url,
        status=job.status,
        source_html=editor_source_html,
        optimized_html=job.optimized_html,
        created_at=job.created_at.isoformat() if job.created_at else "",
        finished_at=job.finished_at.isoformat() if job.finished_at else None,
    )


@router.get("/editor/{job_id}", response_model=EditorDocument)
def get_editor_document(job_id: int, db: Session = Depends(get_db)):
    job = db.query(OptimizationJob).filter(OptimizationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not job.source_html and not job.optimized_html:
        raise HTTPException(status_code=404, detail="No HTML artifacts available for this job")

    return _to_editor_document(job)


@router.put("/editor/{job_id}", response_model=EditorDocument)
def update_editor_document(
    job_id: int,
    req: EditorUpdateRequest,
    db: Session = Depends(get_db),
):
    job = db.query(OptimizationJob).filter(OptimizationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.optimized_html = req.optimized_html
    db.commit()
    db.refresh(job)
    return _to_editor_document(job)
