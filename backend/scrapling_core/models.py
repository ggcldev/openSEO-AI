"""
SQLAlchemy models for optimization jobs.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Text, DateTime

from database import Base


class OptimizationJob(Base):
    __tablename__ = "optimization_jobs"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, nullable=False, index=True)
    keyword = Column(String, nullable=True)
    num_competitors = Column(Integer, default=10)
    status = Column(String, nullable=False, default="pending", index=True)
    audit_result = Column(Text, nullable=True)
    optimized_html = Column(Text, nullable=True)
    competitor_urls = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<OptimizationJob id={self.id} url={self.url} status={self.status}>"
