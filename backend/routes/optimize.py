"""
Scan / optimize routes.
"""
from enum import Enum

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, HttpUrl

from config import llm_config_error
from job_service import create_optimization_job, queue_existing_job_for_optimize
from scrapling_core.url_policy import validate_target_url

router = APIRouter()


class Goal(str, Enum):
    leads = "leads"
    awareness = "awareness"
    product_info = "product_info"


class OptimizeRequest(BaseModel):
    url: HttpUrl
    keyword: str = ""
    goal: Goal = Goal.leads
    num_competitors: int = Field(default=10, ge=3, le=20)


class OptimizeResponse(BaseModel):
    id: int
    url: str
    keyword: str
    status: str
    pipeline_mode: str
    message: str


def _validate_url(req: OptimizeRequest) -> None:
    try:
        validate_target_url(str(req.url))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _ensure_llm_configured() -> None:
    config_error = llm_config_error()
    if config_error:
        raise HTTPException(
            status_code=503,
            detail=f"LLM configuration is missing: {config_error}",
        )


@router.post("/scan", response_model=OptimizeResponse)
def submit_scan(req: OptimizeRequest):
    _validate_url(req)
    _ensure_llm_configured()

    job = create_optimization_job(
        url=str(req.url),
        keyword=req.keyword,
        goal=req.goal.value,
        num_competitors=req.num_competitors,
        pipeline_mode="scan",
        schedule_id=None,
    )

    return OptimizeResponse(
        id=job.id,
        url=job.url,
        keyword=job.keyword,
        status="pending",
        pipeline_mode="scan",
        message="Scan job submitted.",
    )


@router.post("/optimize", response_model=OptimizeResponse)
def submit_full_optimization(req: OptimizeRequest):
    _validate_url(req)
    _ensure_llm_configured()

    job = create_optimization_job(
        url=str(req.url),
        keyword=req.keyword,
        goal=req.goal.value,
        num_competitors=req.num_competitors,
        pipeline_mode="full",
        schedule_id=None,
    )

    return OptimizeResponse(
        id=job.id,
        url=job.url,
        keyword=job.keyword,
        status="pending",
        pipeline_mode="full",
        message="Full optimization job submitted.",
    )


@router.post("/optimize/{job_id}", response_model=OptimizeResponse)
def optimize_existing_job(job_id: int):
    _ensure_llm_configured()

    try:
        job = queue_existing_job_for_optimize(job_id)
    except ValueError as exc:
        detail = str(exc)
        code = 404 if detail == "Job not found." else 400
        raise HTTPException(status_code=code, detail=detail) from exc

    return OptimizeResponse(
        id=job.id,
        url=job.url,
        keyword=job.keyword or "",
        status=job.status,
        pipeline_mode="optimize",
        message="Optimization phase queued.",
    )
