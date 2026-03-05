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
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, or_

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


def recover_stale_running_jobs(max_age_seconds: int = 3600) -> int:
    """
    Requeue running jobs that appear abandoned (e.g., crashed worker).
    """
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=max(60, int(max_age_seconds)))
        updated = (
            db.query(OptimizationJob)
            .filter(OptimizationJob.status == "running")
            .filter(OptimizationJob.started_at.is_not(None))
            .filter(OptimizationJob.started_at <= cutoff)
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


def claim_next_pending_job(*, worker_id: Optional[str] = None) -> Optional[int]:
    """
    Claim one pending and due job and move it to running.
    Returns job id or None.
    """
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # Postgres: row-level locking allows safe multi-worker claiming.
        if not IS_SQLITE:
            with db.begin():
                job = (
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
                    .first()
                )
                if not job:
                    return None

                job.status = "running"
                job.error_stage = None
                job.error_code = None
                job.error_message = None
                job.finished_at = None
                job.next_attempt_at = None
                job.started_at = now
                job.worker_id = worker_id
                return int(job.id)

        # SQLite: optimistic claim using update guard.
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
            return None

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
            return None
        return job_id
    finally:
        db.close()


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
        if pipeline_mode == "scan":
            result = _run_scan_pipeline(
                job.url,
                job.keyword or "",
                job.goal or "leads",
                job.num_competitors or 10,
            )
        elif pipeline_mode == "optimize":
            result = _run_optimize_pipeline_from_existing_job(job)
        else:
            result = _run_full_pipeline(
                job.url,
                job.keyword or "",
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
        due = (
            db.query(ScheduledAudit)
            .filter(
                ScheduledAudit.is_active.is_(True),
                ScheduledAudit.next_run_at <= now,
            )
            .order_by(ScheduledAudit.next_run_at.asc())
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

        db.commit()
        return created
    finally:
        db.close()


def count_queue_backlog() -> int:
    db = SessionLocal()
    try:
        value = db.query(func.count(OptimizationJob.id)).filter(
            OptimizationJob.status == "pending"
        ).scalar()
        return int(value or 0)
    finally:
        db.close()


def count_due_queue_backlog() -> int:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        value = (
            db.query(func.count(OptimizationJob.id))
            .filter(OptimizationJob.status == "pending")
            .filter(
                or_(
                    OptimizationJob.next_attempt_at.is_(None),
                    OptimizationJob.next_attempt_at <= now,
                )
            )
            .scalar()
        )
        return int(value or 0)
    finally:
        db.close()


def count_running_jobs() -> int:
    db = SessionLocal()
    try:
        value = db.query(func.count(OptimizationJob.id)).filter(
            OptimizationJob.status == "running"
        ).scalar()
        return int(value or 0)
    finally:
        db.close()


def count_stale_running_jobs(max_age_seconds: int = 3600) -> int:
    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=max(60, int(max_age_seconds)))
        value = (
            db.query(func.count(OptimizationJob.id))
            .filter(OptimizationJob.status == "running")
            .filter(OptimizationJob.started_at.is_not(None))
            .filter(OptimizationJob.started_at <= cutoff)
            .scalar()
        )
        return int(value or 0)
    finally:
        db.close()


def update_worker_heartbeat(worker_id: str, *, started_at: Optional[datetime] = None) -> None:
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
    db = SessionLocal()
    try:
        threshold = datetime.now(timezone.utc) - timedelta(seconds=stale_after_seconds)
        value = db.query(func.count(WorkerHeartbeat.id)).filter(
            WorkerHeartbeat.last_heartbeat_at >= threshold
        ).scalar()
        return int(value or 0)
    finally:
        db.close()


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


def _extract_title_and_text(source_html: str) -> tuple[str, str]:
    title_match = re.search(
        r"<title[^>]*>(.*?)</title>",
        source_html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    title = ""
    if title_match:
        title = html_stdlib.unescape(title_match.group(1)).strip()

    without_script_style = re.sub(
        r"(?is)<(script|style)\b[^>]*>.*?</\1>",
        " ",
        source_html,
    )
    no_tags = re.sub(r"(?s)<[^>]+>", " ", without_script_style)
    text = html_stdlib.unescape(no_tags)
    text = re.sub(r"\s+", " ", text).strip()
    return title, text


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


def _run_scan_pipeline(url: str, keyword: str, goal: str, num_competitors: int) -> dict:
    from config import get_llm
    from scrapling_core.analyzer import analyze_content, compute_gaps
    from scrapling_core.engine import scrape_page, scrape_pages_parallel
    from scrapling_core.intent_detector import detect_intent
    from scrapling_core.seo_agent import run_seo_audit
    from scrapling_core.serp import get_serp_urls

    llm = get_llm()

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

    effective_keyword = keyword or intent_data.get("industry", "")
    your_analysis = {
        **your_page,
        **analyze_content(your_page.get("body_text", ""), effective_keyword),
    }
    competitor_analyses = [
        {**page, **analyze_content(page.get("body_text", ""), effective_keyword)}
        for page in successful_competitor_pages
    ]
    gaps = compute_gaps(your_analysis, competitor_analyses)

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
    )

    if audit.get("parse_error"):
        return {
            "audit": audit,
            "source_html": your_page.get("raw_html", ""),
            "source_text": your_page.get("body_text", ""),
            "source_title": your_page.get("title", ""),
            "optimized_html": "",
            "competitor_urls": competitor_urls,
            "intent_data": intent_data,
            "gaps": gaps,
            "pipeline_error": {
                "stage": "audit",
                "code": "llm_parse_error",
                "message": "Failed to parse SEO audit response from LLM.",
            },
        }

    return {
        "audit": audit,
        "source_html": your_page.get("raw_html", ""),
        "source_text": your_page.get("body_text", ""),
        "source_title": your_page.get("title", ""),
        "optimized_html": "",
        "competitor_urls": competitor_urls,
        "intent_data": intent_data,
        "gaps": gaps,
        "pipeline_error": None,
    }


def _run_full_pipeline(url: str, keyword: str, goal: str, num_competitors: int) -> dict:
    from config import get_llm
    from scrapling_core.editor_agent import run_editor

    scan_result = _run_scan_pipeline(url, keyword, goal, num_competitors)
    if scan_result.get("pipeline_error"):
        return scan_result

    llm = get_llm()
    intent_data = scan_result.get("intent_data", {})
    audit = scan_result.get("audit", {})
    effective_keyword = keyword or intent_data.get("industry", "")

    try:
        optimized_html = run_editor(
            llm,
            keyword=effective_keyword or "(auto-detected)",
            original_text=scan_result.get("source_text", ""),
            original_html=scan_result.get("source_html", ""),
            title=scan_result.get("source_title", ""),
            audit=audit,
            intent_data=intent_data,
        )
    except Exception as exc:
        scan_result["pipeline_error"] = {
            "stage": "editor",
            "code": "editor_generation_error",
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

    source_html = (job.source_html or "").strip()
    if not source_html:
        raise PipelineExecutionError(
            "optimize",
            "missing_source_html",
            "Source HTML is missing. Run scan first.",
        )

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
            original_html=source_html,
            title=title,
            audit=audit,
            intent_data=intent_data,
        )
    except Exception as exc:
        raise PipelineExecutionError(
            "editor",
            "editor_generation_error",
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
        "pipeline_error": None,
    }
