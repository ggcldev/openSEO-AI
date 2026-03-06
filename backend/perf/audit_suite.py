"""
Performance, stress, and scalability audit suite for openSEO-AI.

Usage examples:
  python perf/audit_suite.py api-latency --iterations 120
  python perf/audit_suite.py db-explain
  python perf/audit_suite.py race-claim --workers 8 --jobs 400
  python perf/audit_suite.py bulk-stress --rows 2000
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tracemalloc
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from statistics import mean
from time import perf_counter, sleep
from types import SimpleNamespace
from typing import Iterable
from unittest.mock import patch
from xml.sax.saxutils import escape as xml_escape
import zipfile

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Prevent background worker noise during benchmark runs.
os.environ.setdefault("EMBEDDED_WORKER_ENABLED", "false")

from database import IS_SQLITE, SessionLocal, engine, init_db  # noqa: E402
from job_service import (  # noqa: E402
    claim_pending_jobs,
    create_optimization_jobs_bulk,
    enqueue_due_schedules,
    recover_stale_running_jobs,
)
from main import app  # noqa: E402
from routes.bulk import _process_bulk_upload  # noqa: E402
from scrapling_core.engine import scrape_pages_parallel  # noqa: E402
from scrapling_core.llm_runtime import LlmInvocationError, invoke_chain_with_retry  # noqa: E402
from scrapling_core.models import OptimizationJob, ScheduledAudit, WorkerHeartbeat  # noqa: E402
from sqlite_worker_lock import SqliteWorkerLock  # noqa: E402

try:
    from fastapi.testclient import TestClient
except Exception as exc:  # pragma: no cover
    raise RuntimeError("fastapi.testclient is required for audit suite") from exc


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * (pct / 100.0)
    lo = int(rank)
    hi = min(lo + 1, len(ordered) - 1)
    weight = rank - lo
    return ordered[lo] * (1.0 - weight) + ordered[hi] * weight


def _reset_test_rows(tag: str) -> None:
    db = SessionLocal()
    try:
        schedule_ids = [
            int(row[0])
            for row in db.query(ScheduledAudit.id)
            .filter(ScheduledAudit.name.like(f"perf-{tag}-%"))
            .all()
        ]
        if schedule_ids:
            db.query(OptimizationJob).filter(
                OptimizationJob.schedule_id.in_(schedule_ids)
            ).delete(synchronize_session=False)

        db.query(OptimizationJob).filter(OptimizationJob.url.like(f"https://perf-{tag}-%")).delete(
            synchronize_session=False
        )
        db.query(ScheduledAudit).filter(
            ScheduledAudit.name.like(f"perf-{tag}-%")
        ).delete(synchronize_session=False)
        db.query(WorkerHeartbeat).filter(WorkerHeartbeat.worker_id.like(f"perf-{tag}-%")).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def run_api_latency(iterations: int, endpoint: str) -> dict:
    init_db()
    latencies: list[float] = []
    errors = 0
    with TestClient(app) as client:
        for _ in range(iterations):
            started = perf_counter()
            response = client.get(endpoint)
            elapsed_ms = (perf_counter() - started) * 1000.0
            latencies.append(elapsed_ms)
            if response.status_code >= 400:
                errors += 1

    return {
        "endpoint": endpoint,
        "iterations": iterations,
        "errors": errors,
        "avg_ms": round(mean(latencies), 2) if latencies else 0.0,
        "p50_ms": round(_percentile(latencies, 50), 2),
        "p95_ms": round(_percentile(latencies, 95), 2),
        "p99_ms": round(_percentile(latencies, 99), 2),
    }


def run_history_load(concurrency_levels: list[int], requests_per_level: int) -> dict:
    init_db()
    result: dict[str, dict] = {}
    with TestClient(app) as client:
        for level in concurrency_levels:
            latencies: list[float] = []
            errors = 0

            def _single_call() -> tuple[float, int]:
                started = perf_counter()
                response = client.get("/api/history?limit=50")
                elapsed_ms = (perf_counter() - started) * 1000.0
                return elapsed_ms, response.status_code

            with ThreadPoolExecutor(max_workers=level) as pool:
                futures = [pool.submit(_single_call) for _ in range(requests_per_level)]
                for future in as_completed(futures):
                    elapsed_ms, status = future.result()
                    latencies.append(elapsed_ms)
                    if status >= 400:
                        errors += 1

            result[str(level)] = {
                "requests": requests_per_level,
                "errors": errors,
                "avg_ms": round(mean(latencies), 2) if latencies else 0.0,
                "p95_ms": round(_percentile(latencies, 95), 2),
                "p99_ms": round(_percentile(latencies, 99), 2),
            }
    return result


def run_db_explain() -> dict:
    init_db()
    explain_prefix = "EXPLAIN QUERY PLAN" if IS_SQLITE else "EXPLAIN"
    statements = {
        "history_list": (
            "SELECT id, url, keyword, status, created_at "
            "FROM optimization_jobs ORDER BY created_at DESC LIMIT 50"
        ),
        "pending_claim_order": (
            "SELECT id FROM optimization_jobs "
            "WHERE status='pending' "
            "ORDER BY COALESCE(next_attempt_at, created_at) ASC, created_at ASC LIMIT 25"
        ),
        "due_schedule": (
            "SELECT id FROM scheduled_audits "
            "WHERE is_active = TRUE AND next_run_at <= CURRENT_TIMESTAMP "
            "ORDER BY next_run_at ASC LIMIT 25"
        ),
    }
    rows_out: dict[str, list[str]] = {}
    with engine.begin() as conn:
        for key, statement in statements.items():
            explain_rows = conn.execute(text(f"{explain_prefix} {statement}")).fetchall()
            rows_out[key] = [str(row) for row in explain_rows]
    return rows_out


def run_race_claim(workers: int, jobs: int) -> dict:
    init_db()
    tag = "race-claim"
    _reset_test_rows(tag)
    payload = [
        {
            "url": f"https://perf-{tag}-{idx}.example.com",
            "keyword": "perf",
            "goal": "leads",
            "num_competitors": 3,
        }
        for idx in range(jobs)
    ]
    create_optimization_jobs_bulk(jobs=payload, pipeline_mode="scan")

    claimed: list[int] = []
    started = perf_counter()

    def _claim_loop(worker_idx: int) -> list[int]:
        worker_claims: list[int] = []
        worker_id = f"perf-{tag}-{worker_idx}"
        while True:
            batch = claim_pending_jobs(worker_id=worker_id, batch_size=5)
            if not batch:
                break
            worker_claims.extend(batch)
        return worker_claims

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_claim_loop, i) for i in range(workers)]
        for future in as_completed(futures):
            claimed.extend(future.result())

    elapsed_s = perf_counter() - started
    duplicates = len(claimed) - len(set(claimed))
    return {
        "workers": workers,
        "jobs_seeded": jobs,
        "jobs_claimed": len(claimed),
        "duplicates": duplicates,
        "elapsed_seconds": round(elapsed_s, 3),
        "jobs_per_second": round(len(claimed) / elapsed_s, 2) if elapsed_s > 0 else 0.0,
    }


def run_stale_recovery() -> dict:
    init_db()
    tag = "stale"
    _reset_test_rows(tag)
    db = SessionLocal()
    try:
        now = _now_utc()
        stale_worker_id = f"perf-{tag}-worker-stale"
        fresh_worker_id = f"perf-{tag}-worker-fresh"

        db.add_all(
            [
                WorkerHeartbeat(
                    worker_id=stale_worker_id,
                    started_at=now - timedelta(hours=2),
                    last_heartbeat_at=now - timedelta(minutes=30),
                    updated_at=now - timedelta(minutes=30),
                ),
                WorkerHeartbeat(
                    worker_id=fresh_worker_id,
                    started_at=now - timedelta(hours=1),
                    last_heartbeat_at=now,
                    updated_at=now,
                ),
            ]
        )
        db.flush()

        stale_job = OptimizationJob(
            url=f"https://perf-{tag}-stale.example.com",
            keyword="stale",
            goal="leads",
            num_competitors=3,
            pipeline_mode="full",
            status="running",
            started_at=now - timedelta(hours=2),
            worker_id=stale_worker_id,
            created_at=now - timedelta(hours=2),
        )
        fresh_job = OptimizationJob(
            url=f"https://perf-{tag}-fresh.example.com",
            keyword="fresh",
            goal="leads",
            num_competitors=3,
            pipeline_mode="full",
            status="running",
            started_at=now - timedelta(minutes=5),
            worker_id=fresh_worker_id,
            created_at=now - timedelta(hours=1),
        )
        db.add_all([stale_job, fresh_job])
        db.commit()

        recovered = recover_stale_running_jobs(max_age_seconds=600, worker_stale_seconds=120)

        stale_after = (
            db.query(OptimizationJob).filter(OptimizationJob.id == stale_job.id).first()
        )
        fresh_after = (
            db.query(OptimizationJob).filter(OptimizationJob.id == fresh_job.id).first()
        )
        return {
            "recovered_count": recovered,
            "stale_job_status": stale_after.status if stale_after else None,
            "fresh_job_status": fresh_after.status if fresh_after else None,
        }
    finally:
        db.close()


def _build_minimal_xlsx(rows: Iterable[tuple[str, str, str, str]]) -> bytes:
    out = BytesIO()
    with zipfile.ZipFile(out, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>""",
        )
        zf.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""",
        )
        zf.writestr(
            "xl/workbook.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>""",
        )
        zf.writestr(
            "xl/_rels/workbook.xml.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>""",
        )

        lines = [
            """<?xml version="1.0" encoding="UTF-8"?>""",
            """<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">""",
            "<sheetData>",
            '<row r="1">'
            '<c r="A1" t="inlineStr"><is><t>url</t></is></c>'
            '<c r="B1" t="inlineStr"><is><t>keyword</t></is></c>'
            '<c r="C1" t="inlineStr"><is><t>goal</t></is></c>'
            '<c r="D1" t="inlineStr"><is><t>num_competitors</t></is></c>'
            "</row>",
        ]
        for idx, (url, keyword, goal, num_competitors) in enumerate(rows, start=2):
            lines.append(
                f'<row r="{idx}">'
                f'<c r="A{idx}" t="inlineStr"><is><t>{xml_escape(url)}</t></is></c>'
                f'<c r="B{idx}" t="inlineStr"><is><t>{xml_escape(keyword)}</t></is></c>'
                f'<c r="C{idx}" t="inlineStr"><is><t>{xml_escape(goal)}</t></is></c>'
                f'<c r="D{idx}" t="inlineStr"><is><t>{xml_escape(num_competitors)}</t></is></c>'
                "</row>"
            )
        lines.append("</sheetData></worksheet>")
        zf.writestr("xl/worksheets/sheet1.xml", "\n".join(lines))
    return out.getvalue()


def run_bulk_stress(rows: int) -> dict:
    init_db()
    tag = "bulk"
    _reset_test_rows(tag)
    payload_rows = [
        (f"https://www.hitachienergy.com/perf-{tag}-{i}", "seo", "leads", "5")
        for i in range(rows)
    ]
    blob = _build_minimal_xlsx(payload_rows)

    started = perf_counter()
    result = _process_bulk_upload(blob, "bulk-stress.xlsx")
    elapsed_s = perf_counter() - started
    return {
        "rows_requested": rows,
        "submitted_count": result.submitted_count,
        "rejected_count": result.rejected_count,
        "elapsed_seconds": round(elapsed_s, 3),
        "rows_per_second": round(result.submitted_count / elapsed_s, 2) if elapsed_s > 0 else 0.0,
    }


def run_schedule_race(workers: int) -> dict:
    init_db()
    tag = "schedule"
    _reset_test_rows(tag)
    db = SessionLocal()
    try:
        now = _now_utc()
        schedule = ScheduledAudit(
            name=f"perf-{tag}-shared",
            url=f"https://perf-{tag}.example.com",
            keyword="schedule",
            goal="leads",
            num_competitors=3,
            interval_minutes=60,
            is_active=True,
            next_run_at=now - timedelta(minutes=1),
            created_at=now,
            updated_at=now,
        )
        db.add(schedule)
        db.commit()
        schedule_id = int(schedule.id)
    finally:
        db.close()

    created_counts: list[int] = []

    def _run_once() -> int:
        return enqueue_due_schedules(limit=25)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_run_once) for _ in range(workers)]
        for future in as_completed(futures):
            created_counts.append(future.result())

    db2 = SessionLocal()
    try:
        jobs_for_schedule = (
            db2.query(OptimizationJob).filter(OptimizationJob.schedule_id == schedule_id).count()
        )
    finally:
        db2.close()

    return {
        "workers": workers,
        "enqueue_calls": len(created_counts),
        "sum_created_from_calls": int(sum(created_counts)),
        "jobs_for_schedule": int(jobs_for_schedule),
    }


def run_llm_resilience() -> dict:
    class FlakyChain:
        def __init__(self, fail_times: int, error_message: str):
            self.fail_times = fail_times
            self.error_message = error_message
            self.calls = 0

        def invoke(self, _: dict):
            self.calls += 1
            if self.calls <= self.fail_times:
                raise RuntimeError(self.error_message)
            return SimpleNamespace(content='{"ok": true}')

    success_chain = FlakyChain(fail_times=2, error_message="429 rate limit")
    failure_chain = FlakyChain(fail_times=10, error_message="timeout while contacting llm")

    success_output = invoke_chain_with_retry(success_chain, {"x": 1}, stage="llm_retry_success")

    failure_error = None
    try:
        invoke_chain_with_retry(failure_chain, {"x": 1}, stage="llm_retry_failure")
    except LlmInvocationError as exc:
        failure_error = {"stage": exc.stage, "code": exc.code, "message": exc.message}

    return {
        "success_attempts": success_chain.calls,
        "success_output": success_output,
        "failure_attempts": failure_chain.calls,
        "failure_error": failure_error,
    }


def run_scrape_cascade(sample_urls: int) -> dict:
    fake_payload = {
        "title": "",
        "headings": [],
        "body_text": "",
        "raw_html": "",
        "word_count": 0,
        "status_code": None,
        "attempts": 1,
        "error": "blocked by waf",
        "error_code": "blocked",
    }

    def _fake_scrape_page(url: str, max_attempts: int = 2) -> dict:
        return {**fake_payload, "url": url, "attempts": max_attempts}

    urls = [f"https://perf-scrape-{i}.example.com" for i in range(sample_urls)]
    with patch("scrapling_core.engine.scrape_page", side_effect=_fake_scrape_page):
        results = scrape_pages_parallel(urls, max_workers=8, max_attempts=2)

    cancelled = sum(1 for row in results if row.get("error_code") == "cancelled")
    blocked = sum(1 for row in results if row.get("error_code") == "blocked")
    return {
        "urls": sample_urls,
        "results": len(results),
        "blocked_or_failed": blocked,
        "cancelled_by_cascade": cancelled,
    }


def run_db_pool_probe(concurrency: int) -> dict:
    init_db()
    errors = 0

    def _query_once() -> float:
        started = perf_counter()
        session = SessionLocal()
        try:
            session.execute(text("SELECT 1"))
            sleep(0.02)
        finally:
            session.close()
        return (perf_counter() - started) * 1000.0

    latencies: list[float] = []
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(_query_once) for _ in range(concurrency * 4)]
        for future in as_completed(futures):
            try:
                latencies.append(future.result())
            except Exception:
                errors += 1

    pool_info = {
        "pool_class": engine.pool.__class__.__name__,
        "size": int(engine.pool.size()) if hasattr(engine.pool, "size") else None,
        "checked_out": (
            int(engine.pool.checkedout()) if hasattr(engine.pool, "checkedout") else None
        ),
    }
    return {
        "concurrency": concurrency,
        "errors": errors,
        "avg_ms": round(mean(latencies), 2) if latencies else 0.0,
        "p95_ms": round(_percentile(latencies, 95), 2),
        "pool": pool_info,
    }


def run_memory_profile(iterations: int) -> dict:
    init_db()
    tracemalloc.start()
    with TestClient(app) as client:
        for _ in range(iterations):
            client.get("/api/history?limit=50")
    snapshot = tracemalloc.take_snapshot()
    top = snapshot.statistics("lineno")[:10]
    tracemalloc.stop()
    return {
        "iterations": iterations,
        "top_allocations": [str(item) for item in top],
    }


def run_sqlite_lock_probe() -> dict:
    first = SqliteWorkerLock(owner="perf-lock-1")
    second = SqliteWorkerLock(owner="perf-lock-2")
    acquired_first = first.acquire()
    acquired_second = second.acquire()
    second.release()
    first.release()
    return {
        "is_sqlite": IS_SQLITE,
        "first_acquired": acquired_first,
        "second_acquired": acquired_second,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="openSEO-AI performance audit suite")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_api = sub.add_parser("api-latency")
    p_api.add_argument("--iterations", type=int, default=120)
    p_api.add_argument("--endpoint", default="/api/reliability/summary")

    p_load = sub.add_parser("history-load")
    p_load.add_argument("--levels", default="10,50,100")
    p_load.add_argument("--requests", type=int, default=120)

    sub.add_parser("db-explain")

    p_claim = sub.add_parser("race-claim")
    p_claim.add_argument("--workers", type=int, default=8)
    p_claim.add_argument("--jobs", type=int, default=500)

    sub.add_parser("stale-recovery")

    p_bulk = sub.add_parser("bulk-stress")
    p_bulk.add_argument("--rows", type=int, default=2000)

    p_schedule = sub.add_parser("schedule-race")
    p_schedule.add_argument("--workers", type=int, default=8)

    sub.add_parser("llm-resilience")

    p_scrape = sub.add_parser("scrape-cascade")
    p_scrape.add_argument("--urls", type=int, default=60)

    p_pool = sub.add_parser("db-pool")
    p_pool.add_argument("--concurrency", type=int, default=64)

    p_mem = sub.add_parser("memory")
    p_mem.add_argument("--iterations", type=int, default=250)

    sub.add_parser("sqlite-lock")
    return parser


def main() -> None:
    args = build_parser().parse_args()

    if args.cmd == "api-latency":
        output = run_api_latency(iterations=args.iterations, endpoint=args.endpoint)
    elif args.cmd == "history-load":
        levels = [int(value.strip()) for value in args.levels.split(",") if value.strip()]
        output = run_history_load(concurrency_levels=levels, requests_per_level=args.requests)
    elif args.cmd == "db-explain":
        output = run_db_explain()
    elif args.cmd == "race-claim":
        output = run_race_claim(workers=args.workers, jobs=args.jobs)
    elif args.cmd == "stale-recovery":
        output = run_stale_recovery()
    elif args.cmd == "bulk-stress":
        output = run_bulk_stress(rows=args.rows)
    elif args.cmd == "schedule-race":
        output = run_schedule_race(workers=args.workers)
    elif args.cmd == "llm-resilience":
        output = run_llm_resilience()
    elif args.cmd == "scrape-cascade":
        output = run_scrape_cascade(sample_urls=args.urls)
    elif args.cmd == "db-pool":
        output = run_db_pool_probe(concurrency=args.concurrency)
    elif args.cmd == "memory":
        output = run_memory_profile(iterations=args.iterations)
    elif args.cmd == "sqlite-lock":
        output = run_sqlite_lock_probe()
    else:  # pragma: no cover
        raise ValueError(f"Unknown command: {args.cmd}")

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
