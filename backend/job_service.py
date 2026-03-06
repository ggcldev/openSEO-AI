"""
Durable job orchestration service.

This module centralizes:
- Job creation
- Pending-job claiming for external workers
- Pipeline execution and status transitions
- Retry/backoff policy for scrape-target failures
- Worker heartbeat updates
"""
from __future__ import annotations

import html as html_stdlib
import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import unquote, urlparse

from sqlalchemy import and_, case, func, or_

from database import IS_SQLITE, SessionLocal
from scrapling_core.models import OptimizationJob, ScheduledAudit, WorkerHeartbeat

logger = logging.getLogger(__name__)


class PipelineExecutionError(Exception):
    def __init__(self, stage: str, code: str, message: str):
        super().__init__(message)
        self.stage = stage
        self.code = code
        self.message = message


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    try:
        value = int(raw) if raw is not None else default
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


_DEFAULT_JOB_MAX_RETRIES = _env_int("JOB_MAX_RETRIES", default=2, minimum=0, maximum=8)
_RETRY_INITIAL_SECONDS = _env_int(
    "JOB_RETRY_INITIAL_SECONDS",
    default=60,
    minimum=5,
    maximum=3600,
)
_RETRY_MAX_SECONDS = _env_int(
    "JOB_RETRY_MAX_SECONDS",
    default=900,
    minimum=_RETRY_INITIAL_SECONDS,
    maximum=21600,
)

_RETRYABLE_SCRAPE_ERROR_CODES = {
    "timeout",
    "blocked",
    "network_error",
    "dns_error",
    "tls_error",
    "unknown_error",
}

_PIPELINE_MODES = {"full", "scan", "optimize"}
_WORKER_HEARTBEAT_ENABLED = _env_bool("WORKER_HEARTBEAT_ENABLED", True)

_SCRIPT_STYLE_BLOCK_RE = re.compile(r"(?is)<(script|style|noscript|iframe|template)\b[^>]*>.*?</\1>")
_CHROME_TAG_BLOCK_RE = re.compile(r"(?is)<(nav|header|footer|aside|form)\b[^>]*>.*?</\1>")
_BODY_CONTENT_RE = re.compile(r"(?is)<body\b[^>]*>(.*?)</body>")
_MAIN_CONTENT_RE = re.compile(r"(?is)<main\b[^>]*>.*?</main>")
_ARTICLE_CONTENT_RE = re.compile(r"(?is)<article\b[^>]*>.*?</article>")
_CHROME_ATTR_BLOCK_RE = re.compile(
    r"(?is)<(div|section|ul|ol)\b[^>]*"
    r"(?:id|class|role|aria-label)\s*=\s*[\"'][^\"']*"
    r"(nav|menu|footer|header|breadcrumb|cookie|sidebar|social|newsletter|legal|sitemap|subscribe)"
    r"[^\"']*[\"'][^>]*>.*?</\1>"
)
_ANCHOR_TAG_RE = re.compile(r"(?is)<a\b[^>]*>.*?</a>")
_INTERACTIVE_TAG_RE = re.compile(r"(?is)<(button|input|select|summary)\b")
_LIST_ITEM_TAG_RE = re.compile(r"(?is)<li\b")
_PARAGRAPH_OR_HEADING_TAG_RE = re.compile(r"(?is)<(p|h[1-6])\b")
_CHROME_TEXT_RE = re.compile(
    r"\b(login|log in|sign in|contact us|top searches|top pages|choose your region|region and language|what are you looking for|menu|search)\b",
    re.IGNORECASE,
)
_GENERIC_URL_SEGMENTS = {
    "about",
    "about-us",
    "blog",
    "careers",
    "case-study",
    "case-studies",
    "contact",
    "content",
    "en",
    "home",
    "index",
    "industries",
    "insights",
    "landing",
    "markets",
    "news",
    "pages",
    "products",
    "resources",
    "service",
    "services",
    "solutions",
    "transportation",
}


@dataclass(frozen=True)
class QueueMetrics:
    queue_backlog: int
    due_backlog: int
    running_jobs: int


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def create_optimization_job(
    *,
    url: str,
    keyword: str,
    goal: str,
    num_competitors: int,
    pipeline_mode: str = "full",
    schedule_id: Optional[int] = None,
) -> OptimizationJob:
    normalized_mode = _normalize_pipeline_mode(pipeline_mode)
    db = SessionLocal()
    try:
        job = OptimizationJob(
            url=url,
            keyword=keyword or "",
            schedule_id=schedule_id,
            goal=goal,
            num_competitors=num_competitors,
            pipeline_mode=normalized_mode,
            status="pending",
            started_at=None,
            worker_id=None,
            retry_count=0,
            max_retries=_DEFAULT_JOB_MAX_RETRIES,
            next_attempt_at=None,
            error_stage=None,
            error_code=None,
            error_message=None,
            created_at=datetime.now(timezone.utc),
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job
    finally:
        db.close()


def create_optimization_jobs_bulk(
    *,
    jobs: list[dict],
    pipeline_mode: str = "full",
    schedule_id: Optional[int] = None,
) -> list[int]:
    """
    Bulk-create optimization jobs in one transaction.
    """
    if not jobs:
        return []

    normalized_mode = _normalize_pipeline_mode(pipeline_mode)
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        rows: list[OptimizationJob] = []
        for item in jobs:
            row = OptimizationJob(
                url=str(item.get("url") or "").strip(),
                keyword=str(item.get("keyword") or "").strip(),
                schedule_id=item.get("schedule_id", schedule_id),
                goal=str(item.get("goal") or "leads").strip() or "leads",
                num_competitors=int(item.get("num_competitors") or 10),
                pipeline_mode=_normalize_pipeline_mode(
                    str(item.get("pipeline_mode") or normalized_mode)
                ),
                status="pending",
                started_at=None,
                worker_id=None,
                retry_count=0,
                max_retries=_DEFAULT_JOB_MAX_RETRIES,
                next_attempt_at=None,
                error_stage=None,
                error_code=None,
                error_message=None,
                created_at=now,
            )
            rows.append(row)

        db.add_all(rows)
        db.flush()
        ids = [int(row.id) for row in rows if row.id is not None]
        db.commit()
        return ids
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def queue_existing_job_for_optimize(job_id: int) -> OptimizationJob:
    """
    Re-queue a completed/failed scan result for optimize phase.
    """
    db = SessionLocal()
    try:
        job = db.query(OptimizationJob).filter(OptimizationJob.id == job_id).first()
        if not job:
            raise ValueError("Job not found.")
        if job.status in ("pending", "running"):
            raise ValueError("Job is still in progress.")
        if not job.source_html:
            raise ValueError("Scan artifacts are missing (source_html). Run scan first.")
        if not job.audit_result:
            raise ValueError("Audit result is missing. Run scan first.")

        job.pipeline_mode = "optimize"
        job.status = "pending"
        job.optimized_html = None
        job.retry_count = 0
        job.next_attempt_at = None
        job.started_at = None
        job.finished_at = None
        job.worker_id = None
        job.error_stage = None
        job.error_code = None
        job.error_message = None
        db.commit()
        db.refresh(job)
        return job
    finally:
        db.close()


def recover_running_jobs_to_pending() -> int:
    """Return the number of jobs reset from running to pending."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        updated = (
            db.query(OptimizationJob)
            .filter(OptimizationJob.status == "running")
            .update(
                {
                    OptimizationJob.status: "pending",
                    OptimizationJob.error_stage: "worker_recovery",
                    OptimizationJob.error_code: "worker_restarted",
                    OptimizationJob.error_message: "Recovered after worker restart.",
                    OptimizationJob.finished_at: None,
                    OptimizationJob.next_attempt_at: now,
                    OptimizationJob.started_at: None,
                    OptimizationJob.worker_id: None,
                },
                synchronize_session=False,
            )
        )
        db.commit()
        return int(updated or 0)
    finally:
        db.close()


def recover_stale_running_jobs(
    max_age_seconds: int = 3600,
    worker_stale_seconds: int = 90,
) -> int:
    """
    Requeue running jobs that appear abandoned (e.g., crashed worker).
    """
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        started_cutoff = now - timedelta(seconds=max(60, int(max_age_seconds)))
        heartbeat_cutoff = now - timedelta(seconds=max(15, int(worker_stale_seconds)))

        stale_ids = [
            int(row[0])
            for row in (
                db.query(OptimizationJob.id)
                .outerjoin(
                    WorkerHeartbeat,
                    WorkerHeartbeat.worker_id == OptimizationJob.worker_id,
                )
                .filter(OptimizationJob.status == "running")
                .filter(OptimizationJob.started_at.is_not(None))
                .filter(OptimizationJob.started_at <= started_cutoff)
                .filter(
                    or_(
                        OptimizationJob.worker_id.is_(None),
                        WorkerHeartbeat.last_heartbeat_at.is_(None),
                        WorkerHeartbeat.last_heartbeat_at <= heartbeat_cutoff,
                    )
                )
                .limit(500)
                .all()
            )
        ]
        if not stale_ids:
            return 0

        updated = (
            db.query(OptimizationJob)
            .filter(OptimizationJob.id.in_(stale_ids))
            .filter(OptimizationJob.status == "running")
            .update(
                {
                    OptimizationJob.status: "pending",
                    OptimizationJob.error_stage: "worker_recovery",
                    OptimizationJob.error_code: "worker_lease_expired",
                    OptimizationJob.error_message: "Recovered stale running job.",
                    OptimizationJob.finished_at: None,
                    OptimizationJob.next_attempt_at: now,
                    OptimizationJob.started_at: None,
                    OptimizationJob.worker_id: None,
                },
                synchronize_session=False,
            )
        )
        db.commit()
        return int(updated or 0)
    finally:
        db.close()


def claim_pending_jobs(
    *,
    worker_id: Optional[str] = None,
    batch_size: int = 1,
) -> list[int]:
    """
    Claim pending and due jobs and move them to running.
    """
    limit = max(1, min(int(batch_size), 25))
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # Postgres: row-level locking allows safe multi-worker claiming with batching.
        if not IS_SQLITE:
            with db.begin():
                jobs = (
                    db.query(OptimizationJob)
                    .filter(OptimizationJob.status == "pending")
                    .filter(
                        or_(
                            OptimizationJob.next_attempt_at.is_(None),
                            OptimizationJob.next_attempt_at <= now,
                        )
                    )
                    .order_by(
                        func.coalesce(
                            OptimizationJob.next_attempt_at,
                            OptimizationJob.created_at,
                        ).asc(),
                        OptimizationJob.created_at.asc(),
                    )
                    .with_for_update(skip_locked=True)
                    .limit(limit)
                    .all()
                )
                for job in jobs:
                    job.status = "running"
                    job.error_stage = None
                    job.error_code = None
                    job.error_message = None
                    job.finished_at = None
                    job.next_attempt_at = None
                    job.started_at = now
                    job.worker_id = worker_id
                return [int(job.id) for job in jobs]

        # SQLite: optimistic claim one-by-one guarded by status in update clause.
        claimed_ids: list[int] = []
        for _ in range(limit):
            row = (
                db.query(OptimizationJob.id)
                .filter(OptimizationJob.status == "pending")
                .filter(
                    or_(
                        OptimizationJob.next_attempt_at.is_(None),
                        OptimizationJob.next_attempt_at <= now,
                    )
                )
                .order_by(
                    func.coalesce(OptimizationJob.next_attempt_at, OptimizationJob.created_at).asc(),
                    OptimizationJob.created_at.asc(),
                )
                .first()
            )
            if not row:
                break

            job_id = int(row[0])
            updated = (
                db.query(OptimizationJob)
                .filter(
                    OptimizationJob.id == job_id,
                    OptimizationJob.status == "pending",
                )
                .update(
                    {
                        OptimizationJob.status: "running",
                        OptimizationJob.error_stage: None,
                        OptimizationJob.error_code: None,
                        OptimizationJob.error_message: None,
                        OptimizationJob.finished_at: None,
                        OptimizationJob.next_attempt_at: None,
                        OptimizationJob.started_at: now,
                        OptimizationJob.worker_id: worker_id,
                    },
                    synchronize_session=False,
                )
            )
            db.commit()
            if not updated:
                continue
            claimed_ids.append(job_id)
        return claimed_ids
    finally:
        db.close()


def claim_next_pending_job(*, worker_id: Optional[str] = None) -> Optional[int]:
    claimed = claim_pending_jobs(worker_id=worker_id, batch_size=1)
    if not claimed:
        return None
    return claimed[0]


def process_job_by_id(job_id: int) -> bool:
    """
    Execute one job end-to-end.
    Returns True when processed (done/failed/retried), False when job not found/skipped.
    """
    db = SessionLocal()
    job: Optional[OptimizationJob] = None
    try:
        job = db.query(OptimizationJob).filter(OptimizationJob.id == job_id).first()
        if not job:
            return False
        if job.status == "done":
            return False

        # Supports processing claimed jobs and direct processing fallback.
        if job.status not in ("running", "pending"):
            return False
        if job.status == "pending":
            job.status = "running"
            job.next_attempt_at = None
            job.started_at = datetime.now(timezone.utc)
            db.commit()

        pipeline_mode = _normalize_pipeline_mode(job.pipeline_mode)
        user_keyword = (job.keyword or "").strip()
        pipeline_keyword = user_keyword or _keyword_from_url(job.url)
        if pipeline_mode == "scan":
            result = _run_scan_pipeline(
                job.url,
                pipeline_keyword,
                job.goal or "leads",
                job.num_competitors or 10,
            )
        elif pipeline_mode == "optimize":
            result = _run_optimize_pipeline_from_existing_job(job)
        else:
            result = _run_full_pipeline(
                job.url,
                pipeline_keyword,
                job.goal or "leads",
                job.num_competitors or 10,
            )

        intent_data = result.get("intent_data", {})
        audit_payload = result.get("audit", {})
        pipeline_error = result.get("pipeline_error")
        _apply_partial_result(job, result)

        if pipeline_error:
            stage = pipeline_error.get("stage") or "pipeline"
            code = pipeline_error.get("code") or "unexpected_error"
            message = pipeline_error.get("message") or "Pipeline failed."

            if _should_retry(job, stage=stage, code=code):
                _schedule_retry(
                    db,
                    job,
                    stage=stage,
                    code=code,
                    message=message,
                    audit_payload=audit_payload,
                )
                return True

            _finalize_failed_job(
                db,
                job,
                stage=stage,
                code=code,
                message=message,
                audit_payload=audit_payload,
            )
            return True

        job.status = "done"
        job.pipeline_mode = pipeline_mode
        job.detected_intent = intent_data.get("intent", "")
        job.page_type = intent_data.get("page_type", "")
        job.region = intent_data.get("region", "")
        job.language = intent_data.get("language", "")
        job.audit_result = json.dumps(audit_payload, ensure_ascii=False)
        job.keyword = _resolve_primary_keyword(
            current_keyword=pipeline_keyword,
            audit_payload=audit_payload,
            intent_data=intent_data,
            source_url=job.url,
        )
        job.source_html = result.get("source_html", "")
        job.optimized_html = result.get("optimized_html", "")
        job.competitor_urls = json.dumps(result.get("competitor_urls", []))
        job.error_stage = None
        job.error_code = None
        job.error_message = None
        job.finished_at = datetime.now(timezone.utc)
        job.next_attempt_at = None
        job.worker_id = None
        db.commit()
        return True

    except PipelineExecutionError as exc:
        if job:
            if _should_retry(job, stage=exc.stage, code=exc.code):
                _schedule_retry(
                    db,
                    job,
                    stage=exc.stage,
                    code=exc.code,
                    message=exc.message,
                    audit_payload=None,
                )
            else:
                _finalize_failed_job(
                    db,
                    job,
                    stage=exc.stage,
                    code=exc.code,
                    message=exc.message,
                    audit_payload=None,
                )
        return True
    except Exception as exc:
        logger.exception("Job %s failed unexpectedly", job_id)
        if job:
            _finalize_failed_job(
                db,
                job,
                stage="pipeline",
                code="unexpected_error",
                message=str(exc),
                audit_payload=None,
            )
        return True
    finally:
        db.close()


def enqueue_due_schedules(limit: int = 25) -> int:
    """
    Enqueue jobs for active schedules whose next_run_at is due.
    """
    db = SessionLocal()
    created = 0
    try:
        now = datetime.now(timezone.utc)
        if not IS_SQLITE:
            with db.begin():
                due = (
                    db.query(ScheduledAudit)
                    .filter(
                        ScheduledAudit.is_active.is_(True),
                        ScheduledAudit.next_run_at <= now,
                    )
                    .order_by(ScheduledAudit.next_run_at.asc())
                    .with_for_update(skip_locked=True)
                    .limit(limit)
                    .all()
                )
                for schedule in due:
                    job = OptimizationJob(
                        url=schedule.url,
                        keyword=schedule.keyword or "",
                        schedule_id=schedule.id,
                        goal=schedule.goal or "leads",
                        num_competitors=schedule.num_competitors or 10,
                        pipeline_mode="full",
                        status="pending",
                        started_at=None,
                        worker_id=None,
                        retry_count=0,
                        max_retries=_DEFAULT_JOB_MAX_RETRIES,
                        next_attempt_at=None,
                        created_at=now,
                    )
                    db.add(job)
                    schedule.last_enqueued_at = now
                    schedule.next_run_at = now + timedelta(minutes=schedule.interval_minutes or 1440)
                    created += 1
            return created

        due = (
            db.query(
                ScheduledAudit.id,
                ScheduledAudit.url,
                ScheduledAudit.keyword,
                ScheduledAudit.goal,
                ScheduledAudit.num_competitors,
                ScheduledAudit.interval_minutes,
            )
            .filter(
                ScheduledAudit.is_active.is_(True),
                ScheduledAudit.next_run_at <= now,
            )
            .order_by(ScheduledAudit.next_run_at.asc())
            .limit(limit)
            .all()
        )
        for schedule in due:
            schedule_id = int(schedule.id)
            next_run = now + timedelta(minutes=schedule.interval_minutes or 1440)
            updated = (
                db.query(ScheduledAudit)
                .filter(
                    ScheduledAudit.id == schedule_id,
                    ScheduledAudit.is_active.is_(True),
                    ScheduledAudit.next_run_at <= now,
                )
                .update(
                    {
                        ScheduledAudit.last_enqueued_at: now,
                        ScheduledAudit.next_run_at: next_run,
                    },
                    synchronize_session=False,
                )
            )
            if not updated:
                db.rollback()
                continue

            job = OptimizationJob(
                url=schedule.url,
                keyword=schedule.keyword or "",
                schedule_id=schedule_id,
                goal=schedule.goal or "leads",
                num_competitors=schedule.num_competitors or 10,
                pipeline_mode="full",
                status="pending",
                started_at=None,
                worker_id=None,
                retry_count=0,
                max_retries=_DEFAULT_JOB_MAX_RETRIES,
                next_attempt_at=None,
                created_at=now,
            )
            db.add(job)
            db.commit()
            created += 1

        return created
    finally:
        db.close()


def get_queue_metrics() -> QueueMetrics:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        row = (
            db.query(
                func.coalesce(
                    func.sum(
                        case(
                            (OptimizationJob.status == "pending", 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("queue_backlog"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                and_(
                                    OptimizationJob.status == "pending",
                                    or_(
                                        OptimizationJob.next_attempt_at.is_(None),
                                        OptimizationJob.next_attempt_at <= now,
                                    ),
                                ),
                                1,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ).label("due_backlog"),
                func.coalesce(
                    func.sum(
                        case(
                            (OptimizationJob.status == "running", 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("running_jobs"),
            )
            .one()
        )
        return QueueMetrics(
            queue_backlog=int(row.queue_backlog or 0),
            due_backlog=int(row.due_backlog or 0),
            running_jobs=int(row.running_jobs or 0),
        )
    finally:
        db.close()


def count_queue_backlog() -> int:
    return get_queue_metrics().queue_backlog


def count_due_queue_backlog() -> int:
    return get_queue_metrics().due_backlog


def count_running_jobs() -> int:
    return get_queue_metrics().running_jobs


def count_stale_running_jobs(
    max_age_seconds: int = 3600,
    worker_stale_seconds: int = 90,
) -> int:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        started_cutoff = now - timedelta(seconds=max(60, int(max_age_seconds)))
        heartbeat_cutoff = now - timedelta(seconds=max(15, int(worker_stale_seconds)))
        value = (
            db.query(func.count(OptimizationJob.id))
            .outerjoin(
                WorkerHeartbeat,
                WorkerHeartbeat.worker_id == OptimizationJob.worker_id,
            )
            .filter(OptimizationJob.status == "running")
            .filter(OptimizationJob.started_at.is_not(None))
            .filter(OptimizationJob.started_at <= started_cutoff)
            .filter(
                or_(
                    OptimizationJob.worker_id.is_(None),
                    WorkerHeartbeat.last_heartbeat_at.is_(None),
                    WorkerHeartbeat.last_heartbeat_at <= heartbeat_cutoff,
                )
            )
            .scalar()
        )
        return int(value or 0)
    finally:
        db.close()


def update_worker_heartbeat(worker_id: str, *, started_at: Optional[datetime] = None) -> None:
    if not _WORKER_HEARTBEAT_ENABLED:
        return
    if not worker_id:
        return

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        row = db.query(WorkerHeartbeat).filter(WorkerHeartbeat.worker_id == worker_id).first()
        if row:
            row.last_heartbeat_at = now
            row.updated_at = now
        else:
            db.add(
                WorkerHeartbeat(
                    worker_id=worker_id,
                    started_at=started_at or now,
                    last_heartbeat_at=now,
                    updated_at=now,
                )
            )
        db.commit()
    finally:
        db.close()


def count_active_workers(stale_after_seconds: int = 90) -> int:
    if not _WORKER_HEARTBEAT_ENABLED:
        return 0

    db = SessionLocal()
    try:
        threshold = datetime.now(timezone.utc) - timedelta(seconds=stale_after_seconds)
        value = db.query(func.count(WorkerHeartbeat.id)).filter(
            WorkerHeartbeat.last_heartbeat_at >= threshold
        ).scalar()
        return int(value or 0)
    finally:
        db.close()


def is_worker_heartbeat_enabled() -> bool:
    return _WORKER_HEARTBEAT_ENABLED


def _normalize_pipeline_mode(mode: Optional[str]) -> str:
    candidate = (mode or "full").strip().lower()
    if candidate in _PIPELINE_MODES:
        return candidate
    return "full"


def _apply_partial_result(job: OptimizationJob, result: dict) -> None:
    """
    Persist available artifacts even when a pipeline stage fails.
    """
    intent_data = result.get("intent_data", {})
    if isinstance(intent_data, dict):
        job.detected_intent = intent_data.get("intent", job.detected_intent or "")
        job.page_type = intent_data.get("page_type", job.page_type or "")
        job.region = intent_data.get("region", job.region or "")
        job.language = intent_data.get("language", job.language or "")

    if result.get("audit") is not None:
        job.audit_result = json.dumps(result.get("audit"), ensure_ascii=False)

    source_html = result.get("source_html")
    if isinstance(source_html, str) and source_html.strip():
        job.source_html = source_html

    optimized_html = result.get("optimized_html")
    if isinstance(optimized_html, str):
        job.optimized_html = optimized_html

    competitor_urls = result.get("competitor_urls")
    if isinstance(competitor_urls, list):
        job.competitor_urls = json.dumps(competitor_urls, ensure_ascii=False)

    job.keyword = _resolve_primary_keyword(
        current_keyword=job.keyword or "",
        audit_payload=result.get("audit"),
        intent_data=intent_data,
        source_url=job.url,
    )


def _extract_title_and_text(source_html: str) -> tuple[str, str]:
    title_match = re.search(
        r"<title[^>]*>(.*?)</title>",
        source_html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    title = ""
    if title_match:
        title = html_stdlib.unescape(title_match.group(1)).strip()

    focus_html = _extract_editor_context_html(source_html) or source_html
    without_script_style = _SCRIPT_STYLE_BLOCK_RE.sub(" ", focus_html)
    no_tags = re.sub(r"(?is)<[^>]+>", " ", without_script_style)
    text = html_stdlib.unescape(no_tags)
    text = re.sub(r"\s+", " ", text).strip()
    return title, text


def _extract_editor_context_html(source_html: str) -> str:
    """
    Build a content-focused HTML fragment for editor/LLM context by removing
    common navigation/footer chrome and link-heavy blocks.
    """
    if not source_html:
        return ""

    body_match = _BODY_CONTENT_RE.search(source_html)
    body_html = body_match.group(1) if body_match else source_html

    main_match = _MAIN_CONTENT_RE.search(body_html)
    if main_match:
        candidate = main_match.group(0)
    else:
        article_match = _ARTICLE_CONTENT_RE.search(body_html)
        candidate = article_match.group(0) if article_match else body_html

    cleaned = _SCRIPT_STYLE_BLOCK_RE.sub(" ", candidate)
    cleaned = _CHROME_TAG_BLOCK_RE.sub(" ", cleaned)

    for _ in range(3):
        next_cleaned = _CHROME_ATTR_BLOCK_RE.sub(" ", cleaned)
        if next_cleaned == cleaned:
            break
        cleaned = next_cleaned

    def remove_link_heavy(match: re.Match) -> str:
        block = match.group(0)
        anchors = len(_ANCHOR_TAG_RE.findall(block))
        interactions = len(_INTERACTIVE_TAG_RE.findall(block))
        list_items = len(_LIST_ITEM_TAG_RE.findall(block))
        has_structured_copy = _PARAGRAPH_OR_HEADING_TAG_RE.search(block) is not None
        text = _normalize_space(html_stdlib.unescape(re.sub(r"(?is)<[^>]+>", " ", block)))
        has_chrome_marker = _CHROME_TEXT_RE.search(text) is not None
        if anchors >= 20:
            return " "
        if anchors >= 10 and (not has_structured_copy or len(text) < 1800):
            return " "
        if anchors >= 6 and not has_structured_copy and len(text) < 1200:
            return " "
        if interactions >= 8 and not has_structured_copy:
            return " "
        if list_items >= 8 and not has_structured_copy:
            return " "
        if has_chrome_marker and (anchors >= 2 or interactions >= 3 or list_items >= 3):
            return " "
        return block

    cleaned = re.sub(
        r"(?is)<(div|section|ul|ol)\b[^>]*>.*?</\1>",
        remove_link_heavy,
        cleaned,
    )

    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _safe_json_object(value: Optional[str]) -> dict:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except Exception:
        return {}
    if isinstance(parsed, dict):
        return parsed
    return {}


def _keyword_from_url(source_url: str) -> str:
    candidate = ""
    try:
        parsed = urlparse(source_url or "")
        segments = [unquote(segment).strip() for segment in parsed.path.split("/") if segment and segment.strip()]
        for segment in reversed(segments):
            lowered = segment.lower()
            if lowered in _GENERIC_URL_SEGMENTS:
                continue
            if lowered.isdigit():
                continue
            candidate = segment
            break

        if not candidate:
            host = (parsed.netloc or "").split(":")[0].strip().lower()
            if host.startswith("www."):
                host = host[4:]
            host_label = host.split(".")[0] if host else ""
            candidate = host_label
    except Exception:
        candidate = ""

    normalized = re.sub(r"\.[a-z0-9]{2,6}$", "", candidate, flags=re.IGNORECASE)
    normalized = re.sub(r"[^a-zA-Z0-9\-_ ]+", " ", normalized)
    normalized = re.sub(r"[-_]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _resolve_primary_keyword(
    *,
    current_keyword: str,
    audit_payload: Optional[dict],
    intent_data: Optional[dict],
    source_url: str,
) -> str:
    explicit = (current_keyword or "").strip()
    if explicit:
        return explicit

    if isinstance(audit_payload, dict):
        keywords_payload = audit_payload.get("keywords")
        if isinstance(keywords_payload, dict):
            primary = str(keywords_payload.get("primary") or "").strip()
            if primary and primary.lower() != "(auto-detected)":
                return primary

    if isinstance(intent_data, dict):
        industry = str(intent_data.get("industry") or "").strip()
        if industry:
            return industry
        serp_query = str(intent_data.get("serp_query") or "").strip()
        if serp_query:
            return serp_query

    return _keyword_from_url(source_url)


def _should_retry(job: OptimizationJob, *, stage: str, code: str) -> bool:
    max_retries = int(job.max_retries or 0)
    retry_count = int(job.retry_count or 0)
    if retry_count >= max_retries:
        return False
    if stage != "scrape_target":
        return False
    return code in _RETRYABLE_SCRAPE_ERROR_CODES


def _compute_retry_delay_seconds(next_retry_count: int) -> int:
    delay = _RETRY_INITIAL_SECONDS * (2 ** max(next_retry_count - 1, 0))
    return min(delay, _RETRY_MAX_SECONDS)


def _schedule_retry(
    db,
    job: OptimizationJob,
    *,
    stage: str,
    code: str,
    message: str,
    audit_payload: Optional[dict],
) -> None:
    next_retry_count = int(job.retry_count or 0) + 1
    delay_seconds = _compute_retry_delay_seconds(next_retry_count)
    now = datetime.now(timezone.utc)

    payload = dict(audit_payload or {})
    payload.update(
        {
            "error": message,
            "stage": stage,
            "code": code,
            "retry_scheduled": True,
            "retry_count": next_retry_count,
            "max_retries": int(job.max_retries or 0),
            "next_attempt_at": (now + timedelta(seconds=delay_seconds)).isoformat(),
        }
    )

    job.status = "pending"
    job.retry_count = next_retry_count
    job.next_attempt_at = now + timedelta(seconds=delay_seconds)
    job.error_stage = stage
    job.error_code = code
    job.error_message = (
        f"{message} [auto-retry {next_retry_count}/{job.max_retries} in {delay_seconds}s]"
    )
    job.audit_result = json.dumps(payload, ensure_ascii=False)
    job.finished_at = None
    job.started_at = None
    job.worker_id = None
    db.commit()

    logger.warning(
        "Job id=%s scheduled for retry %s/%s in %ss (stage=%s code=%s)",
        job.id,
        next_retry_count,
        job.max_retries,
        delay_seconds,
        stage,
        code,
    )


def _finalize_failed_job(
    db,
    job: OptimizationJob,
    *,
    stage: str,
    code: str,
    message: str,
    audit_payload: Optional[dict],
) -> None:
    payload = dict(audit_payload or {})
    payload.update(
        {
            "error": message,
            "stage": stage,
            "code": code,
            "retry_scheduled": False,
            "retry_count": int(job.retry_count or 0),
            "max_retries": int(job.max_retries or 0),
        }
    )

    job.status = "failed"
    job.error_stage = stage
    job.error_code = code
    job.error_message = message
    job.audit_result = json.dumps(payload, ensure_ascii=False)
    job.finished_at = datetime.now(timezone.utc)
    job.next_attempt_at = None
    job.worker_id = None
    db.commit()


def _run_scan_pipeline(
    url: str,
    keyword: str,
    goal: str,
    num_competitors: int,
    *,
    llm=None,
) -> dict:
    from config import get_llm
    from scrapling_core.analyzer import analyze_content, compute_gaps
    from scrapling_core.engine import scrape_page, scrape_pages_parallel
    from scrapling_core.intent_detector import detect_intent
    from scrapling_core.seo_agent import run_seo_audit
    from scrapling_core.serp import get_serp_urls
    from scrapling_core.style_profile import build_style_profile

    llm = llm or get_llm()

    your_page = scrape_page(url, max_attempts=3)
    if your_page.get("error"):
        raise PipelineExecutionError(
            "scrape_target",
            your_page.get("error_code", "scrape_failed"),
            your_page.get("error", "Failed to scrape target page."),
        )

    try:
        intent_data = detect_intent(llm, your_page)
    except Exception:
        intent_data = {
            "intent": "informational",
            "page_type": "service",
            "industry": "",
            "region": "global",
            "language": "en",
            "serp_query": "",
        }

    competitor_urls: list[str] = []
    serp_query = intent_data.get("serp_query") or keyword
    if serp_query:
        try:
            serp_urls = get_serp_urls(serp_query, num=num_competitors + 2)
            competitor_urls = [u for u in serp_urls if url not in u][:num_competitors]
        except Exception:
            competitor_urls = []

    competitor_pages = (
        scrape_pages_parallel(competitor_urls, max_attempts=2) if competitor_urls else []
    )
    successful_competitor_pages = [p for p in competitor_pages if not p.get("error")]
    raw_html = your_page.get("raw_html", "") or ""
    extracted_title, extracted_text = _extract_title_and_text(raw_html)
    source_title = extracted_title or your_page.get("title", "")
    source_text = extracted_text or your_page.get("body_text", "")
    editor_html_context = _extract_editor_context_html(raw_html) or raw_html

    style_profile = build_style_profile(
        title=source_title,
        body_text=source_text,
        headings=your_page.get("headings", []),
    )

    effective_keyword = keyword or intent_data.get("industry", "")
    your_analysis = {
        **your_page,
        **analyze_content(source_text, effective_keyword),
    }
    competitor_analyses = [
        {**page, **analyze_content(page.get("body_text", ""), effective_keyword)}
        for page in successful_competitor_pages
    ]
    gaps = compute_gaps(your_analysis, competitor_analyses)

    try:
        audit = run_seo_audit(
            llm,
            keyword=effective_keyword or "(auto-detected)",
            your_page=your_analysis,
            competitor_pages=competitor_analyses,
            gaps=gaps,
            intent_data=intent_data,
            region=intent_data.get("region", "global"),
            language=intent_data.get("language", "en"),
            goal=goal,
            style_profile=style_profile,
        )
    except Exception as exc:
        return {
            "audit": {},
            "source_html": raw_html,
            "source_text": source_text,
            "source_title": source_title,
            "editor_html_context": editor_html_context,
            "optimized_html": "",
            "competitor_urls": competitor_urls,
            "intent_data": intent_data,
            "style_profile": style_profile,
            "gaps": gaps,
            "pipeline_error": {
                "stage": "audit",
                "code": getattr(exc, "code", "audit_generation_error"),
                "message": str(exc),
            },
        }

    if audit.get("parse_error"):
        return {
            "audit": audit,
            "source_html": raw_html,
            "source_text": source_text,
            "source_title": source_title,
            "editor_html_context": editor_html_context,
            "optimized_html": "",
            "competitor_urls": competitor_urls,
            "intent_data": intent_data,
            "style_profile": style_profile,
            "gaps": gaps,
            "pipeline_error": {
                "stage": "audit",
                "code": "llm_parse_error",
                "message": "Failed to parse SEO audit response from LLM.",
            },
        }

    return {
        "audit": audit,
        "source_html": raw_html,
        "source_text": source_text,
        "source_title": source_title,
        "editor_html_context": editor_html_context,
        "optimized_html": "",
        "competitor_urls": competitor_urls,
        "intent_data": intent_data,
        "style_profile": style_profile,
        "gaps": gaps,
        "pipeline_error": None,
    }


def _run_full_pipeline(url: str, keyword: str, goal: str, num_competitors: int) -> dict:
    from config import get_llm
    from scrapling_core.editor_agent import run_editor

    llm = get_llm()
    scan_result = _run_scan_pipeline(url, keyword, goal, num_competitors, llm=llm)
    if scan_result.get("pipeline_error"):
        return scan_result

    intent_data = scan_result.get("intent_data", {})
    audit = scan_result.get("audit", {})
    style_profile = scan_result.get("style_profile")
    effective_keyword = keyword or intent_data.get("industry", "")

    try:
        optimized_html = run_editor(
            llm,
            keyword=effective_keyword or "(auto-detected)",
            original_text=scan_result.get("source_text", ""),
            original_html=scan_result.get("editor_html_context") or scan_result.get("source_html", ""),
            title=scan_result.get("source_title", ""),
            audit=audit,
            intent_data=intent_data,
            style_profile=style_profile,
        )
    except Exception as exc:
        scan_result["pipeline_error"] = {
            "stage": "editor",
            "code": getattr(exc, "code", "editor_generation_error"),
            "message": str(exc),
        }
        return scan_result

    if not optimized_html.strip():
        scan_result["pipeline_error"] = {
            "stage": "editor",
            "code": "empty_editor_output",
            "message": "Editor generated empty HTML output.",
        }
        return scan_result

    scan_result["optimized_html"] = optimized_html
    scan_result["pipeline_error"] = None
    return scan_result


def _run_optimize_pipeline_from_existing_job(job: OptimizationJob) -> dict:
    from config import get_llm
    from scrapling_core.editor_agent import run_editor
    from scrapling_core.style_profile import build_style_profile, extract_headings_from_html

    source_html = (job.source_html or "").strip()
    if not source_html:
        raise PipelineExecutionError(
            "optimize",
            "missing_source_html",
            "Source HTML is missing. Run scan first.",
        )
    editor_context_html = _extract_editor_context_html(source_html) or source_html

    audit = _safe_json_object(job.audit_result)
    if not audit:
        raise PipelineExecutionError(
            "optimize",
            "missing_audit_result",
            "Audit result is missing. Run scan first.",
        )
    if audit.get("parse_error"):
        raise PipelineExecutionError(
            "optimize",
            "invalid_audit_result",
            "Audit result is invalid. Re-run scan before optimize.",
        )

    competitor_urls: list[str] = []
    if job.competitor_urls:
        try:
            parsed_competitors = json.loads(job.competitor_urls)
            if isinstance(parsed_competitors, list):
                competitor_urls = [str(x) for x in parsed_competitors]
        except Exception:
            competitor_urls = []

    title, source_text = _extract_title_and_text(source_html)
    style_profile = build_style_profile(
        title=title,
        body_text=source_text,
        headings=extract_headings_from_html(editor_context_html),
    )
    intent_data = {
        "intent": job.detected_intent or "informational",
        "page_type": job.page_type or "service",
        "region": job.region or "global",
        "language": job.language or "en",
    }

    llm = get_llm()
    try:
        optimized_html = run_editor(
            llm,
            keyword=(job.keyword or "").strip() or "(auto-detected)",
            original_text=source_text,
            original_html=editor_context_html,
            title=title,
            audit=audit,
            intent_data=intent_data,
            style_profile=style_profile,
        )
    except Exception as exc:
        raise PipelineExecutionError(
            "editor",
            getattr(exc, "code", "editor_generation_error"),
            str(exc),
        ) from exc

    if not optimized_html.strip():
        raise PipelineExecutionError(
            "editor",
            "empty_editor_output",
            "Editor generated empty HTML output.",
        )

    return {
        "audit": audit,
        "source_html": source_html,
        "source_text": source_text,
        "source_title": title,
        "optimized_html": optimized_html,
        "competitor_urls": competitor_urls,
        "intent_data": intent_data,
        "style_profile": style_profile,
        "pipeline_error": None,
    }
