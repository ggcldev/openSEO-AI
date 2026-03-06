"""
Embedded worker loop for local/dev reliability.

This allows the API process to claim/process queued jobs when an external
worker is not launched, preventing jobs from remaining pending indefinitely.
"""
from __future__ import annotations

import logging
import os
import socket
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from job_service import (
    claim_pending_jobs,
    enqueue_due_schedules,
    get_queue_metrics,
    process_job_by_id,
    recover_stale_running_jobs,
    update_worker_heartbeat,
)
from sqlite_worker_lock import SqliteWorkerLock

logger = logging.getLogger(__name__)


def _env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.getenv(name)
    try:
        value = float(raw) if raw is not None else default
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class EmbeddedWorker:
    def __init__(self) -> None:
        self.poll_seconds = _env_float("WORKER_POLL_SECONDS", 2.0, 0.2, 30.0)
        self.schedule_check_seconds = _env_float("WORKER_SCHEDULE_CHECK_SECONDS", 30.0, 1.0, 300.0)
        self.heartbeat_seconds = _env_float("WORKER_HEARTBEAT_SECONDS", 15.0, 1.0, 120.0)
        self.stale_running_seconds = _env_float("STALE_RUNNING_SECONDS", 1800.0, 60.0, 86400.0)
        self.recovery_check_seconds = _env_float("WORKER_RECOVERY_CHECK_SECONDS", 60.0, 5.0, 600.0)
        self.enabled = _env_bool("EMBEDDED_WORKER_ENABLED", True)

        self.worker_id = (
            f"api-embedded-{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:8]}"
        )
        self._sqlite_lock = SqliteWorkerLock(owner=f"embedded-worker:{self.worker_id}")
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if not self.enabled:
            logger.info("Embedded worker is disabled by EMBEDDED_WORKER_ENABLED.")
            return
        if self._thread and self._thread.is_alive():
            return
        if not self._sqlite_lock.acquire():
            logger.warning(
                "Embedded worker disabled because another SQLite worker lock is active."
            )
            return

        try:
            started_at = datetime.now(timezone.utc)
            update_worker_heartbeat(self.worker_id, started_at=started_at)
            recovered = recover_stale_running_jobs(
                max_age_seconds=int(self.stale_running_seconds),
                worker_stale_seconds=max(15, int(self.heartbeat_seconds) * 3),
            )
            logger.info(
                "Embedded worker started worker_id=%s recovered_stale_running_jobs=%s",
                self.worker_id,
                recovered,
            )
        except Exception:
            # Keep API available even if local embedded worker initialization fails.
            logger.exception("Embedded worker failed to initialize; continuing without embedded worker.")
            self._sqlite_lock.release()
            return

        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run_loop,
            name="embedded-worker",
            daemon=True,
        )
        self._thread.start()

    def stop(self, timeout_seconds: float = 5.0) -> None:
        if not self._thread:
            return
        self._stop.set()
        self._thread.join(timeout=timeout_seconds)
        self._sqlite_lock.release()
        logger.info("Embedded worker stopped worker_id=%s", self.worker_id)

    def _run_loop(self) -> None:
        last_schedule_check = 0.0
        last_heartbeat = 0.0
        last_recovery_check = 0.0

        while not self._stop.is_set():
            now = time.time()

            if now - last_heartbeat >= self.heartbeat_seconds:
                update_worker_heartbeat(self.worker_id)
                last_heartbeat = now

            if now - last_schedule_check >= self.schedule_check_seconds:
                try:
                    created = enqueue_due_schedules(limit=50)
                    if created:
                        logger.info(
                            "Embedded worker enqueued scheduled jobs worker_id=%s count=%s",
                            self.worker_id,
                            created,
                        )
                except Exception:
                    logger.exception("Embedded worker failed while enqueueing schedules.")
                last_schedule_check = now

            if now - last_recovery_check >= self.recovery_check_seconds:
                try:
                    recovered = recover_stale_running_jobs(
                        max_age_seconds=int(self.stale_running_seconds),
                        worker_stale_seconds=max(15, int(self.heartbeat_seconds) * 3),
                    )
                    if recovered:
                        logger.warning(
                            "Embedded worker recovered stale running jobs worker_id=%s count=%s",
                            self.worker_id,
                            recovered,
                        )
                except Exception:
                    logger.exception("Embedded worker stale-recovery check failed.")
                last_recovery_check = now

            try:
                claimed_job_ids = claim_pending_jobs(
                    worker_id=self.worker_id,
                    batch_size=2,
                )
            except Exception:
                logger.exception("Embedded worker failed while claiming next job.")
                self._stop.wait(self.poll_seconds)
                continue

            if not claimed_job_ids:
                self._stop.wait(self.poll_seconds)
                continue

            metrics = get_queue_metrics()
            logger.info(
                "Embedded worker claimed_jobs=%s pending_backlog=%s due_backlog=%s running=%s",
                len(claimed_job_ids),
                metrics.queue_backlog,
                metrics.due_backlog,
                metrics.running_jobs,
            )
            for job_id in claimed_job_ids:
                try:
                    process_job_by_id(job_id)
                except Exception:
                    logger.exception("Embedded worker failed while processing job id=%s", job_id)
