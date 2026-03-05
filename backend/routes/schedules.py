"""
Scheduled audit management routes.
"""
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy.orm import Session

from database import get_db
from job_service import create_optimization_job
from scrapling_core.models import ScheduledAudit
from scrapling_core.url_policy import validate_target_url

router = APIRouter()


class Goal(str, Enum):
    leads = "leads"
    awareness = "awareness"
    product_info = "product_info"


class ScheduleCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: HttpUrl
    keyword: str = ""
    goal: Goal = Goal.leads
    num_competitors: int = Field(default=10, ge=3, le=20)
    interval_minutes: int = Field(default=1440, ge=15, le=10080)
    start_at: Optional[datetime] = None
    is_active: bool = True


class ScheduleUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    keyword: Optional[str] = None
    goal: Optional[Goal] = None
    num_competitors: Optional[int] = Field(default=None, ge=3, le=20)
    interval_minutes: Optional[int] = Field(default=None, ge=15, le=10080)
    next_run_at: Optional[datetime] = None
    is_active: Optional[bool] = None


class ScheduleItem(BaseModel):
    id: int
    name: str
    url: str
    keyword: str
    goal: str
    num_competitors: int
    interval_minutes: int
    is_active: bool
    last_enqueued_at: Optional[str] = None
    next_run_at: str
    created_at: str
    updated_at: str


class RunNowResponse(BaseModel):
    schedule_id: int
    job_id: int
    status: str


def _normalize_utc(dt: Optional[datetime]) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _to_item(s: ScheduledAudit) -> ScheduleItem:
    return ScheduleItem(
        id=s.id,
        name=s.name,
        url=s.url,
        keyword=s.keyword or "",
        goal=s.goal or "leads",
        num_competitors=s.num_competitors or 10,
        interval_minutes=s.interval_minutes or 1440,
        is_active=bool(s.is_active),
        last_enqueued_at=s.last_enqueued_at.isoformat() if s.last_enqueued_at else None,
        next_run_at=s.next_run_at.isoformat() if s.next_run_at else "",
        created_at=s.created_at.isoformat() if s.created_at else "",
        updated_at=s.updated_at.isoformat() if s.updated_at else "",
    )


@router.post("/schedules", response_model=ScheduleItem)
def create_schedule(req: ScheduleCreateRequest, db: Session = Depends(get_db)):
    try:
        validate_target_url(str(req.url))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    now = datetime.now(timezone.utc)
    next_run = _normalize_utc(req.start_at)
    if next_run < now:
        next_run = now

    schedule = ScheduledAudit(
        name=req.name.strip(),
        url=str(req.url),
        keyword=req.keyword or "",
        goal=req.goal.value,
        num_competitors=req.num_competitors,
        interval_minutes=req.interval_minutes,
        is_active=req.is_active,
        next_run_at=next_run,
        created_at=now,
        updated_at=now,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return _to_item(schedule)


@router.get("/schedules", response_model=list[ScheduleItem])
def list_schedules(
    active: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(ScheduledAudit)
    if active is not None:
        query = query.filter(ScheduledAudit.is_active.is_(active))
    schedules = query.order_by(ScheduledAudit.created_at.desc()).limit(limit).all()
    return [_to_item(s) for s in schedules]


@router.patch("/schedules/{schedule_id}", response_model=ScheduleItem)
def update_schedule(
    schedule_id: int,
    req: ScheduleUpdateRequest,
    db: Session = Depends(get_db),
):
    schedule = db.query(ScheduledAudit).filter(ScheduledAudit.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if req.name is not None:
        schedule.name = req.name.strip()
    if req.keyword is not None:
        schedule.keyword = req.keyword
    if req.goal is not None:
        schedule.goal = req.goal.value
    if req.num_competitors is not None:
        schedule.num_competitors = req.num_competitors
    if req.interval_minutes is not None:
        schedule.interval_minutes = req.interval_minutes
        if schedule.next_run_at and schedule.last_enqueued_at:
            schedule.next_run_at = schedule.last_enqueued_at + timedelta(minutes=req.interval_minutes)
    if req.next_run_at is not None:
        schedule.next_run_at = _normalize_utc(req.next_run_at)
    if req.is_active is not None:
        schedule.is_active = req.is_active

    schedule.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(schedule)
    return _to_item(schedule)


@router.post("/schedules/{schedule_id}/run-now", response_model=RunNowResponse)
def run_schedule_now(schedule_id: int, db: Session = Depends(get_db)):
    schedule = db.query(ScheduledAudit).filter(ScheduledAudit.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if not schedule.is_active:
        raise HTTPException(status_code=400, detail="Schedule is inactive")

    job = create_optimization_job(
        url=schedule.url,
        keyword=schedule.keyword or "",
        goal=schedule.goal or "leads",
        num_competitors=schedule.num_competitors or 10,
        pipeline_mode="full",
        schedule_id=schedule.id,
    )
    now = datetime.now(timezone.utc)
    schedule.last_enqueued_at = now
    schedule.next_run_at = now + timedelta(minutes=schedule.interval_minutes or 1440)
    schedule.updated_at = now
    db.commit()

    return RunNowResponse(schedule_id=schedule.id, job_id=job.id, status="pending")


@router.delete("/schedules/{schedule_id}", response_model=ScheduleItem)
def deactivate_schedule(schedule_id: int, db: Session = Depends(get_db)):
    schedule = db.query(ScheduledAudit).filter(ScheduledAudit.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    schedule.is_active = False
    schedule.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(schedule)
    return _to_item(schedule)
