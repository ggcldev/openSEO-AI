"""
SQLAlchemy models for scrape jobs.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Text, DateTime

from database import Base


class ScrapeJob(Base):
    __tablename__ = "scrape_jobs"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, nullable=False, index=True)
    agent = Column(String, nullable=False, default="summarize")
    config = Column(Text, default="{}")
    status = Column(String, nullable=False, default="pending", index=True)  # pending | running | done | failed
    result = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<ScrapeJob id={self.id} url={self.url} status={self.status}>"
