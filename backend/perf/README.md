# Performance Audit Suite

This folder contains reproducible benchmarks and stress probes used to close the backend performance TODOs.

Run from `backend/`:

```bash
python perf/audit_suite.py <command>
```

## Commands

- `api-latency`:
  - Measures endpoint latency p50/p95/p99.
  - Covers `B2.1`.
- `db-explain`:
  - Dumps DB execution plans for queue/history/schedule queries.
  - Covers `B2.2`.
- `race-claim`:
  - Simulates multi-worker queue claiming and checks duplicate claims.
  - Covers `T3.1`, `S4.1`.
- `stale-recovery`:
  - Verifies stale-running recovery behavior with fresh vs stale heartbeats.
  - Covers `T3.2`.
- `bulk-stress`:
  - Generates a synthetic XLSX and posts up to 2000 rows through bulk parser.
  - Covers `T3.3`.
- `schedule-race`:
  - Fires concurrent schedule enqueue loops and verifies duplicate safety.
  - Covers `T3.4`.
- `llm-resilience`:
  - Simulates timeout/rate-limit retries via controlled flaky chain.
  - Covers `T3.5`, `S4.7`.
- `scrape-cascade`:
  - Validates scrape-failure cascade cancellation behavior.
  - Covers `T3.6`, `S4.4`.
- `db-pool`:
  - Exercises DB sessions under concurrency and prints pool stats.
  - Covers `T3.7`.
- `history-load`:
  - Concurrent API load at configurable levels.
  - Covers `B2.4`.
- `memory`:
  - Uses `tracemalloc` while exercising API endpoints.
  - Covers `B2.6`.
- `sqlite-lock`:
  - Verifies single-worker lock semantics in SQLite mode.
  - Covers `S4.3`.

## Optional k6 Scenario

If `k6` is installed:

```bash
k6 run perf/k6_history_load.js
```

This is an external load profile for `B2.4`.
