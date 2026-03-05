"""
Database session and setup.

Supports:
- SQLite (default, local)
- Postgres (via DATABASE_URL)
"""
import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

_DEFAULT_DATABASE_URL = "sqlite:///./openseo.db"


def _normalize_database_url(url: str) -> str:
    # Heroku-style URL compatibility.
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


DATABASE_URL = _normalize_database_url(os.getenv("DATABASE_URL", _DEFAULT_DATABASE_URL))
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine_kwargs = {}
if IS_SQLITE:
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def _ensure_column(table_name: str, column_name: str, definition: str) -> None:
    """
    Add a column when missing.

    This is a lightweight migration guard for local SQLite usage.
    """
    if not IS_SQLITE:
        return

    with engine.begin() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
        existing = {row[1] for row in rows}
        if column_name not in existing:
            conn.execute(
                text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
            )


def _ensure_index(index_name: str, table_name: str, columns_sql: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS {index_name} "
                f"ON {table_name} ({columns_sql})"
            )
        )


def init_db():
    """Create all tables and apply lightweight backward-compatible migrations."""
    from scrapling_core.models import OptimizationJob, ScheduledAudit, WorkerHeartbeat  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # SQLite compatibility migrations for existing local DB files.
    if IS_SQLITE:
        _ensure_column("optimization_jobs", "schedule_id", "INTEGER")
        _ensure_column("optimization_jobs", "source_html", "TEXT")
        _ensure_column("optimization_jobs", "pipeline_mode", "VARCHAR DEFAULT 'full'")
        _ensure_column("optimization_jobs", "error_stage", "VARCHAR")
        _ensure_column("optimization_jobs", "error_code", "VARCHAR")
        _ensure_column("optimization_jobs", "error_message", "TEXT")
        _ensure_column("optimization_jobs", "retry_count", "INTEGER DEFAULT 0")
        _ensure_column("optimization_jobs", "max_retries", "INTEGER DEFAULT 2")
        _ensure_column("optimization_jobs", "next_attempt_at", "DATETIME")
        _ensure_column("optimization_jobs", "started_at", "DATETIME")
        _ensure_column("optimization_jobs", "worker_id", "VARCHAR")

    _ensure_index(
        "idx_optimization_jobs_pending_next_attempt",
        "optimization_jobs",
        "status, next_attempt_at, created_at",
    )
    _ensure_index(
        "idx_optimization_jobs_running_started",
        "optimization_jobs",
        "status, started_at",
    )
    _ensure_index(
        "idx_optimization_jobs_worker_id",
        "optimization_jobs",
        "worker_id",
    )
    _ensure_index(
        "idx_worker_heartbeats_last_seen",
        "worker_heartbeats",
        "last_heartbeat_at",
    )


def get_db():
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
