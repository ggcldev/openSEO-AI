"""
External durable worker process.

Runs independently from the API process:
- Recovers stale running jobs
- Enqueues due scheduled audits
- Claims and processes pending jobs from DB
- Publishes worker heartbeat for reliability monitoring
"""
from __future__ import annotations

import argparse
import logging
import os
import socket
import time
import uuid
from datetime import datetime, timezone

from env_loader import ensure_local_env_loaded

ensure_local_env_loaded()

from database import init_db
from job_service import (
    claim_pending_jobs,
    enqueue_due_schedules,
    get_queue_metrics,
    process_job_by_id,
    recover_stale_running_jobs,
    update_worker_heartbeat,
)
from sqlite_worker_lock import SqliteWorkerLock


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="openSEO-AI durable worker")
    parser.add_argument("--poll-seconds", type=float, default=2.0, help="Queue polling interval")
    parser.add_argument(
        "--schedule-check-seconds",
        type=float,
        default=30.0,
        help="How often to evaluate due schedules",
    )
    parser.add_argument(
        "--heartbeat-seconds",
        type=float,
        default=15.0,
        help="How often to update worker heartbeat",
    )
    parser.add_argument(
        "--stale-running-seconds",
        type=float,
        default=1800.0,
        help="Running jobs older than this are considered stale and re-queued",
    )
    parser.add_argument(
        "--recovery-check-seconds",
        type=float,
        default=60.0,
        help="How often to run stale-running recovery checks",
    )
    parser.add_argument(
        "--claim-batch-size",
        type=int,
        default=2,
        help="Number of jobs to claim per polling iteration",
    )
    return parser.parse_args()


def _build_worker_id() -> str:
    return f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:8]}"


def run_worker(
    *,
    poll_seconds: float,
    schedule_check_seconds: float,
    heartbeat_seconds: float,
    stale_running_seconds: float,
    recovery_check_seconds: float,
    claim_batch_size: int,
) -> None:
    init_db()

    worker_id = _build_worker_id()
    sqlite_lock = SqliteWorkerLock(owner=f"external-worker:{worker_id}")
    if not sqlite_lock.acquire():
        logging.error(
            "Another worker is already running against SQLite. "
            "Use Postgres for multi-worker concurrency."
        )
        return

    started_at = datetime.now(timezone.utc)
    update_worker_heartbeat(worker_id, started_at=started_at)

    try:
        recovered = recover_stale_running_jobs(
            max_age_seconds=int(stale_running_seconds),
            worker_stale_seconds=max(15, int(heartbeat_seconds) * 3),
        )
        logging.info(
            "Worker startup complete. worker_id=%s recovered_stale_running_jobs=%s",
            worker_id,
            recovered,
        )

        last_schedule_check = 0.0
        last_heartbeat = 0.0
        last_recovery_check = 0.0

        while True:
            now = time.time()

            if now - last_heartbeat >= heartbeat_seconds:
                update_worker_heartbeat(worker_id)
                last_heartbeat = now

            if now - last_schedule_check >= schedule_check_seconds:
                created = enqueue_due_schedules(limit=50)
                if created:
                    logging.info("worker_id=%s scheduled_jobs_enqueued=%s", worker_id, created)
                last_schedule_check = now

            if now - last_recovery_check >= recovery_check_seconds:
                recovered = recover_stale_running_jobs(
                    max_age_seconds=int(stale_running_seconds),
                    worker_stale_seconds=max(15, int(heartbeat_seconds) * 3),
                )
                if recovered:
                    logging.warning("worker_id=%s recovered_stale_jobs=%s", worker_id, recovered)
                last_recovery_check = now

            claimed_job_ids = claim_pending_jobs(
                worker_id=worker_id,
                batch_size=max(1, int(claim_batch_size)),
            )
            if not claimed_job_ids:
                time.sleep(poll_seconds)
                continue

            metrics = get_queue_metrics()
            logging.info(
                "worker_id=%s claimed_jobs=%s pending_backlog=%s due_backlog=%s running=%s",
                worker_id,
                len(claimed_job_ids),
                metrics.queue_backlog,
                metrics.due_backlog,
                metrics.running_jobs,
            )
            for job_id in claimed_job_ids:
                process_job_by_id(job_id)
    finally:
        sqlite_lock.release()


def main() -> None:
    args = _parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [worker] %(message)s",
    )
    run_worker(
        poll_seconds=args.poll_seconds,
        schedule_check_seconds=args.schedule_check_seconds,
        heartbeat_seconds=args.heartbeat_seconds,
        stale_running_seconds=args.stale_running_seconds,
        recovery_check_seconds=args.recovery_check_seconds,
        claim_batch_size=args.claim_batch_size,
    )


if __name__ == "__main__":
    main()
