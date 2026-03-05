"""
SQLAlchemy models for optimization jobs.
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from database import Base


class OptimizationJob(Base):
    __tablename__ = "optimization_jobs"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, nullable=False, index=True)
    keyword = Column(String, nullable=True)
    schedule_id = Column(Integer, nullable=True, index=True)
    goal = Column(String, nullable=True)
    num_competitors = Column(Integer, default=10)
    pipeline_mode = Column(String, nullable=False, default="full", index=True)
    status = Column(String, nullable=False, default="pending", index=True)
    started_at = Column(DateTime, nullable=True, index=True)
    worker_id = Column(String, nullable=True, index=True)
    retry_count = Column(Integer, nullable=False, default=0)
    max_retries = Column(Integer, nullable=False, default=2)
    next_attempt_at = Column(DateTime, nullable=True, index=True)
    detected_intent = Column(String, nullable=True)
    page_type = Column(String, nullable=True)
    region = Column(String, nullable=True)
    language = Column(String, nullable=True)
    audit_result = Column(Text, nullable=True)
    source_html = Column(Text, nullable=True)
    optimized_html = Column(Text, nullable=True)
    competitor_urls = Column(Text, nullable=True)
    error_stage = Column(String, nullable=True)
    error_code = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime, nullable=True)


class ScheduledAudit(Base):
    __tablename__ = "scheduled_audits"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False, index=True)
    keyword = Column(String, nullable=True)
    goal = Column(String, nullable=True, default="leads")
    num_competitors = Column(Integer, default=10)
    interval_minutes = Column(Integer, default=1440)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    last_enqueued_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"

    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(String, nullable=False, unique=True, index=True)
    started_at = Column(DateTime, nullable=False)
    last_heartbeat_at = Column(DateTime, nullable=False, index=True)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
