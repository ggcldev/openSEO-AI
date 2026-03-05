# Performance Audit — Findings

## Codebase Audited

**Date:** 2026-03-06
**Version:** 0.3.0

---

## Architecture Summary

| Layer | Tech | Key Files |
|-------|------|-----------|
| Backend | Python 3.11, FastAPI, SQLAlchemy, Playwright | `job_service.py` (630 LOC), `engine.py`, `seo_agent.py` |
| Frontend | Next.js 15, React 19, Tailwind CSS | `dashboard/page.tsx` (560 LOC), `HtmlEditorPanel.tsx` |
| Database | PostgreSQL (prod) / SQLite (dev) | 3 tables, DB-backed job queue |
| Workers | Embedded + External worker processes | `embedded_worker.py`, `worker.py` |
| Infra | Docker Compose, 4 containers | postgres, backend-api, worker, frontend |

---

## Files Audited

### Backend

| File | LOC (approx) | Purpose |
|------|-------------|---------|
| `main.py` | ~60 | FastAPI app, CORS, lifespan, router registration |
| `config.py` | ~30 | LLM provider factory (Groq/Claude) |
| `database.py` | ~80 | SQLAlchemy engine, session, migrations |
| `job_service.py` | ~630 | Job orchestration, durable queue, retry logic, pipeline execution |
| `embedded_worker.py` | ~100 | In-process background worker thread |
| `worker.py` | ~120 | External CLI worker process |
| `routes/optimize.py` | ~80 | POST /api/scan, /api/optimize endpoints |
| `routes/history.py` | ~60 | GET /api/history endpoints |
| `routes/editor.py` | ~50 | GET/PUT /api/editor endpoints |
| `routes/export.py` | ~40 | GET /api/export (download HTML) |
| `routes/bulk.py` | ~70 | POST /api/bulk/upload (XLSX ingestion) |
| `routes/schedules.py` | ~120 | Schedule CRUD endpoints |
| `routes/reliability.py` | ~100 | GET /api/reliability/summary (SLA monitoring) |
| `scrapling_core/models.py` | ~100 | SQLAlchemy ORM models (3 tables) |
| `scrapling_core/engine.py` | ~120 | Scraping engine (Scrapling + Playwright) |
| `scrapling_core/analyzer.py` | ~80 | Content analysis (YAKE keyword extraction) |
| `scrapling_core/intent_detector.py` | ~60 | LLM-based page intent classification |
| `scrapling_core/seo_agent.py` | ~80 | LLM-based SEO audit generation |
| `scrapling_core/editor_agent.py` | ~70 | LLM-based HTML content rewriting |
| `scrapling_core/serp.py` | ~50 | Google SERP fetcher |
| `scrapling_core/url_policy.py` | ~40 | SSRF protection & URL validation |

### Frontend

| File | LOC (approx) | Purpose |
|------|-------------|---------|
| `app/layout.tsx` | ~27 | Root layout with navigation |
| `app/page.tsx` | ~20 | Home landing page |
| `app/dashboard/page.tsx` | ~560 | Main dashboard (form, history, automation) |
| `app/editor/[jobId]/page.tsx` | ~65 | Dynamic editor page |
| `components/HtmlEditorPanel.tsx` | ~300 | HTML editor with live editing & SEO signals |
| `components/JobDetailPanel.tsx` | ~205 | Job detail modal with timeline |
| `components/TableResults.tsx` | ~464 | Expandable results table with pack details |
| `lib/apiClient.ts` | ~112 | Centralized typed API client |
| `types.ts` | ~155 | Shared TypeScript interfaces |

### Infrastructure

| File | Purpose |
|------|---------|
| `docker-compose.yml` | 4-service stack (postgres, backend, worker, frontend) |
| `Dockerfile` (root) | Single-container HF Spaces deployment |
| `backend/Dockerfile` | Backend container (Python 3.11 + Playwright) |
| `frontend/Dockerfile` | Frontend container (Node 20-alpine) |
| `deploy/hf/start.sh` | HF Spaces multi-process startup |
| `deploy/hf/README.md` | HF deployment instructions |
| `.env.example` | Environment variable template |

---

## Preliminary Findings (from Static Review)

### Critical

1. **Sync SQLAlchemy in Async Handlers** — FastAPI routes are `async def` but SQLAlchemy calls are synchronous, blocking the event loop. Affects all routes using `Session`. This means a single slow DB query blocks all concurrent requests.

2. **No Playwright Browser Pooling** — `engine.py` creates a new browser instance per scrape. Under concurrent jobs, this causes high memory usage (~200-300MB per Chromium instance) and slow cold-start times.

### High

3. **Embedded Worker Shares FastAPI Process** — `embedded_worker.py` runs heavy Playwright + LLM workloads in the same process as the API server. CPU/memory spikes from job processing directly degrade API response times.

4. **Unbounded History Loading** — `routes/history.py` loads full `audit_result` JSON blobs (can be 50-100KB each) for list queries. With limit=200, this can return 10-20MB of JSON per request.

5. **Sequential LLM Pipeline** — `job_service.py` runs intent detection → SERP fetch → competitor scraping → audit → optimization sequentially. Intent detection and SERP fetch could run in parallel, saving ~2-5 seconds per job.

6. **SQLite Concurrent Write Limitation** — Dev/demo mode uses SQLite which has no row-level locking. Multiple workers will cause `database is locked` errors.

### Medium

7. **Dashboard Re-render Storm** — `dashboard/page.tsx` has 15+ `useState` hooks in a single 560-line component. Any state change re-renders the entire dashboard including the history table.

8. **3-Second Polling** — Dashboard polls `/api/history` every 3 seconds when jobs are active. With multiple users, this creates unnecessary load. WebSocket or SSE would be more efficient.

9. **Hardcoded CORS Origin** — `main.py` only allows `http://localhost:3000`. Any non-localhost deployment or port change breaks the frontend.

10. **No DB Connection Pooling Config** — `database.py` uses default SQLAlchemy pool settings. Under load, connections may exhaust or not be recycled properly.

### Low

11. **SERP Rate Limiting** — `serp.py` has 1-second delay between searches but no configurable rate limit. Under bulk upload (2000 URLs × 10 competitors), this creates a long sequential queue.

12. **No Frontend Error Boundaries** — React error boundaries are missing. A rendering error in any component crashes the entire page.

13. **Frontend Dev Mode in Docker** — `frontend/Dockerfile` runs `npm run dev` instead of `npm run build && npm start`, missing Next.js production optimizations.

14. **Worker Heartbeat Table Coupling** — Horizontal scaling requires all workers to share the same DB for heartbeat coordination, preventing truly stateless worker deployments.
