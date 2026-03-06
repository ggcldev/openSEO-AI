# Scalability Hardening Notes

## S4.1 DB-Backed Job Queue

- Implemented batched claiming in [`job_service.py`](../job_service.py) via `claim_pending_jobs(...)`.
- Postgres path now claims `LIMIT N` rows with `FOR UPDATE SKIP LOCKED`.
- Validation: `python perf/audit_suite.py race-claim --workers 8 --jobs 500`.

## S4.2 Embedded Worker (Noisy Neighbor)

- Embedded worker remains optional and controllable via `EMBEDDED_WORKER_ENABLED`.
- Docker Compose runs with `EMBEDDED_WORKER_ENABLED=false` to isolate API from worker CPU/memory pressure.
- Validation: compare `api-latency` results with embedded worker enabled vs disabled.

## S4.3 SQLite Concurrency Limits

- Added process lock guard [`sqlite_worker_lock.py`](../sqlite_worker_lock.py) to prevent multiple SQLite workers.
- Applied to both external worker and embedded worker startup paths.
- Validation: `python perf/audit_suite.py sqlite-lock`.

## S4.4 Browser/Stealth Scrape Pressure

- Added bounded stealth concurrency (`STEALTHY_FETCH_MAX_CONCURRENCY`).
- Added failure cascade cancel behavior in parallel scrape execution to reduce runaway resource use.
- Validation: `python perf/audit_suite.py scrape-cascade --urls 60`.

## S4.5 CORS Multi-Instance Support

- Replaced hardcoded origin with `CORS_ALLOWED_ORIGINS` comma-separated config in [`main.py`](../main.py).

## S4.6 Worker State Coupling

- Worker heartbeat is now optional via `WORKER_HEARTBEAT_ENABLED`.
- Reliability alerts suppress heartbeat-missing alerts when disabled.

## S4.7 LLM Rate Limits

- Added shared retry/backoff + concurrency gate in [`llm_runtime.py`](../scrapling_core/llm_runtime.py).
- Applied runtime wrapper across intent detector, SEO audit, and editor calls.
- Validation: `python perf/audit_suite.py llm-resilience`.
