"""
GET /api/export/{job_id} — Download optimized HTML for a completed job.
"""
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from scrapling_core.models import OptimizationJob

router = APIRouter()


def _slugify(text: str) -> str:
    """Convert text to a safe filename slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return text[:60] or "optimized"


@router.get("/export/{job_id}")
def export_html(job_id: int, db: Session = Depends(get_db)):
    """Download the optimized HTML content for a completed job."""
    job = db.query(OptimizationJob).filter(OptimizationJob.id == job_id).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != "done":
        raise HTTPException(status_code=400, detail="Job is not completed yet")

    if not job.optimized_html:
        raise HTTPException(status_code=404, detail="No optimized HTML available for this job")

    # Build filename from keyword or URL
    slug = _slugify(job.keyword) if job.keyword else _slugify(job.url.split("//")[-1].split("/")[0])
    filename = f"{slug}-optimized.html"

    return Response(
        content=job.optimized_html,
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
