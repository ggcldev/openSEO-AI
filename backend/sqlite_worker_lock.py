"""
Best-effort process lock to avoid multi-worker write contention on SQLite.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from database import IS_SQLITE

try:
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None  # type: ignore[assignment]


logger = logging.getLogger(__name__)


class SqliteWorkerLock:
    def __init__(self, owner: str):
        self.owner = owner
        self.lock_path = os.getenv("SQLITE_WORKER_LOCK_FILE", "/tmp/openseo-sqlite-worker.lock")
        self._fh: Optional[object] = None

    def acquire(self) -> bool:
        if not IS_SQLITE:
            return True
        if fcntl is None:
            logger.warning("fcntl is unavailable; SQLite worker lock is disabled.")
            return True

        os.makedirs(os.path.dirname(self.lock_path), exist_ok=True)
        handle = open(self.lock_path, "a+", encoding="utf-8")
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            handle.close()
            return False

        handle.seek(0)
        handle.truncate()
        handle.write(self.owner)
        handle.flush()
        self._fh = handle
        return True

    def release(self) -> None:
        if self._fh is None or fcntl is None:
            return
        try:
            fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        try:
            self._fh.close()
        except Exception:
            pass
        self._fh = None
