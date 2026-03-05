"""
Reliability and SLA summary routes.
"""
from __future__ import annotations

import math
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from database import SessionLocal, engine
from job_service import (
    count_active_workers,
    count_due_queue_backlog,
    count_queue_backlog,
    count_running_jobs,
    count_stale_running_jobs,
)
from scrapling_core.models import OptimizationJob

router = APIRouter()


def _env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.getenv(name)
    try:
        value = float(raw) if raw is not None else default
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    try:
        value = int(raw) if raw is not None else default
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _percentile(values: list[float], p: float) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]

    rank = (len(ordered) - 1) * (p / 100.0)
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return ordered[low]
    weight = rank - low
    return ordered[low] * (1 - weight) + ordered[high] * weight


class BreakdownItem(BaseModel):
    key: str
    count: int


class SloTargets(BaseModel):
    scrape_success_rate_target: float
    job_success_rate_target: float
    p95_completion_minutes_target: float


class ReliabilitySummary(BaseModel):
    window_days: int
    since: str
    generated_at: str

    queue_backlog: int
    due_backlog: int
    running_jobs: int
    stale_running_jobs: int
    active_workers: int
    database_backend: str

    submitted_jobs: int
    completed_jobs: int
    done_jobs: int
    failed_jobs: int
    scrape_failed_jobs: int
    retried_jobs: int
    retry_pending_jobs: int

    scrape_success_rate: float
    job_success_rate: float
    p95_completion_minutes: Optional[float] = None

    targets: SloTargets
    alerts: list[str] = Field(default_factory=list)
    failure_codes: list[BreakdownItem] = Field(default_factory=list)
    failure_domains: list[BreakdownItem] = Field(default_factory=list)


@router.get("/reliability/summary", response_model=ReliabilitySummary)
def reliability_summary(
    window_days: int = Query(30, ge=1, le=180),
    top_n: int = Query(8, ge=1, le=20),
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=window_days)

    scrape_target = _env_float("SLO_SCRAPE_SUCCESS_TARGET", 99.5, 90.0, 100.0)
    job_target = _env_float("SLO_JOB_SUCCESS_TARGET", 99.0, 80.0, 100.0)
    p95_target = _env_float("SLO_P95_MINUTES_TARGET", 15.0, 1.0, 240.0)
    worker_stale_seconds = _env_int("WORKER_STALE_SECONDS", 90, 15, 600)
    stale_running_seconds = _env_int("STALE_RUNNING_SECONDS", 1800, 300, 86400)

    db = SessionLocal()
    try:
        jobs = db.query(OptimizationJob).filter(OptimizationJob.created_at >= since).all()
    finally:
        db.close()

    submitted_jobs = len(jobs)
    done_jobs = sum(1 for j in jobs if j.status == "done")
    failed_jobs = sum(1 for j in jobs if j.status == "failed")
    completed_jobs = done_jobs + failed_jobs

    scrape_failed_jobs = sum(
        1 for j in jobs if j.status == "failed" and (j.error_stage or "") == "scrape_target"
    )
    retried_jobs = sum(1 for j in jobs if int(j.retry_count or 0) > 0)
    retry_pending_jobs = sum(
        1 for j in jobs if j.status == "pending" and int(j.retry_count or 0) > 0
    )

    if submitted_jobs > 0:
        scrape_success_rate = ((submitted_jobs - scrape_failed_jobs) / submitted_jobs) * 100.0
        job_success_rate = (done_jobs / submitted_jobs) * 100.0
    else:
        scrape_success_rate = 100.0
        job_success_rate = 100.0

    durations_minutes: list[float] = []
    for job in jobs:
        if job.status not in ("done", "failed"):
            continue
        if not job.created_at or not job.finished_at:
            continue
        duration = (job.finished_at - job.created_at).total_seconds() / 60.0
        if duration >= 0:
            durations_minutes.append(duration)

    p95_minutes = _percentile(durations_minutes, 95.0)

    failure_code_counter: Counter[str] = Counter()
    failure_domain_counter: Counter[str] = Counter()

    for job in jobs:
        if job.status != "failed":
            continue
        failure_code_counter[(job.error_code or "unknown_error").strip() or "unknown_error"] += 1

        host = (urlparse(job.url).netloc or "").lower().strip()
        if host:
            failure_domain_counter[host] += 1

    active_workers = count_active_workers(stale_after_seconds=worker_stale_seconds)
    due_backlog = count_due_queue_backlog()
    stale_running_jobs = count_stale_running_jobs(max_age_seconds=stale_running_seconds)
    alerts: list[str] = []
    if scrape_success_rate < scrape_target:
        alerts.append(
            f"Scrape success {scrape_success_rate:.2f}% is below target {scrape_target:.2f}%"
        )
    if job_success_rate < job_target:
        alerts.append(
            f"Job success {job_success_rate:.2f}% is below target {job_target:.2f}%"
        )
    if p95_minutes is not None and p95_minutes > p95_target:
        alerts.append(
            f"P95 completion {p95_minutes:.2f}m is above target {p95_target:.2f}m"
        )
    if active_workers <= 0:
        alerts.append("No active worker heartbeat detected")
    if due_backlog > 0 and active_workers <= 0:
        alerts.append("Due backlog exists but no active worker is available")
    if stale_running_jobs > 0:
        alerts.append(f"{stale_running_jobs} stale running jobs detected")

    return ReliabilitySummary(
        window_days=window_days,
        since=since.isoformat(),
        generated_at=now.isoformat(),
        queue_backlog=count_queue_backlog(),
        due_backlog=due_backlog,
        running_jobs=count_running_jobs(),
        stale_running_jobs=stale_running_jobs,
        active_workers=active_workers,
        database_backend=engine.dialect.name,
        submitted_jobs=submitted_jobs,
        completed_jobs=completed_jobs,
        done_jobs=done_jobs,
        failed_jobs=failed_jobs,
        scrape_failed_jobs=scrape_failed_jobs,
        retried_jobs=retried_jobs,
        retry_pending_jobs=retry_pending_jobs,
        scrape_success_rate=round(scrape_success_rate, 2),
        job_success_rate=round(job_success_rate, 2),
        p95_completion_minutes=(round(p95_minutes, 2) if p95_minutes is not None else None),
        targets=SloTargets(
            scrape_success_rate_target=scrape_target,
            job_success_rate_target=job_target,
            p95_completion_minutes_target=p95_target,
        ),
        alerts=alerts,
        failure_codes=[
            BreakdownItem(key=key, count=count)
            for key, count in failure_code_counter.most_common(top_n)
        ],
        failure_domains=[
            BreakdownItem(key=key, count=count)
            for key, count in failure_domain_counter.most_common(top_n)
        ],
    )
