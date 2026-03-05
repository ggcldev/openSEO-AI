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

from database import init_db
from job_service import (
    claim_next_pending_job,
    count_due_queue_backlog,
    count_queue_backlog,
    enqueue_due_schedules,
    process_job_by_id,
    recover_stale_running_jobs,
    update_worker_heartbeat,
)


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
) -> None:
    init_db()

    worker_id = _build_worker_id()
    started_at = datetime.now(timezone.utc)
    update_worker_heartbeat(worker_id, started_at=started_at)

    recovered = recover_stale_running_jobs(max_age_seconds=int(stale_running_seconds))
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
            recovered = recover_stale_running_jobs(max_age_seconds=int(stale_running_seconds))
            if recovered:
                logging.warning("worker_id=%s recovered_stale_jobs=%s", worker_id, recovered)
            last_recovery_check = now

        job_id = claim_next_pending_job(worker_id=worker_id)
        if job_id is None:
            time.sleep(poll_seconds)
            continue

        logging.info(
            "worker_id=%s processing_job=%s pending_backlog=%s due_backlog=%s",
            worker_id,
            job_id,
            count_queue_backlog(),
            count_due_queue_backlog(),
        )
        process_job_by_id(job_id)


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
    )


if __name__ == "__main__":
    main()
