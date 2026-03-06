# openSEO AI

Open-source AI-powered SEO on-page optimization tool. Analyze any page against top SERP competitors and get actionable recommendations — title tags, meta descriptions, headings, keyword density, content gaps, and prioritized fixes.

## How It Works

1. **Enter your URL** + optional primary keyword
2. **SERP analysis** — fetches top results for your keyword
3. **Page scraping** — scrapes your page + competitors using Scrapling + Playwright
4. **Content analysis** — keyword density, word count, heading structure, entity extraction
5. **AI audit** — Groq/Claude agent produces full on-page SEO recommendations
6. **Worker pipeline** — durable queue worker runs scrape/analyze/audit/editor lifecycle
7. **Dashboard** — view history, reliability metrics, and export exact HTML artifacts

## Features

- Full on-page SEO audit (title, meta, H1/H2, keyword density, word count, content gaps)
- SERP competitor analysis
- Stealth scraping with Scrapling + Playwright
- Source HTML capture + optimized HTML export
- Manual editor mode (live preview + save optimized HTML)
- Durable DB-backed queue with external worker service
- Job-level retry/backoff for scrape-target failures
- Worker heartbeat + reliability summary API
- Scheduled audits (interval-based)
- Bulk `.xlsx` upload pipeline for URL batches
- AI-powered recommendations via Groq or Claude
- Job history with filters and auto-refresh
- Reliability panel in dashboard (SLO progress, failures by code/domain)

## Scraping Reliability Note

- This project uses Scrapling with `StealthyFetcher` plus fallback `Fetcher`.
- Scrapling stealth improves scrape success on many modern sites.
- No scraper can guarantee universal anti-bot bypass on every website.
- Reliability should be managed with SLA/SLO controls (retry/backoff, monitoring, and incident response), not assumed bypass.

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI (Python) |
| Scraping | Scrapling + Playwright |
| AI Agent | LangChain + Groq / Claude |
| NLP | YAKE |
| Database | SQLite/Postgres + SQLAlchemy |
| Frontend | Next.js + TypeScript |
| Styling | Tailwind CSS |

## Project Structure

```text
openSEO-AI/
├── backend/
│   ├── main.py                    # FastAPI app
│   ├── database.py                # DB setup (SQLite/Postgres) + local migration guards
│   ├── job_service.py             # Durable queue orchestration + retry policy
│   ├── worker.py                  # External queue worker + heartbeat
│   ├── routes/
│   │   ├── optimize.py            # POST /api/optimize
│   │   ├── history.py             # GET /api/history
│   │   ├── bulk.py                # POST /api/bulk/upload
│   │   ├── schedules.py           # Scheduled audits APIs
│   │   ├── editor.py              # HTML editor APIs
│   │   ├── export.py              # HTML export APIs
│   │   └── reliability.py         # SLA/reliability summary API
│   └── scrapling_core/
│       ├── engine.py              # Scrapling scraping engine
│       ├── serp.py                # SERP fetcher
│       ├── analyzer.py            # Content analysis
│       ├── seo_agent.py           # Audit agent
│       ├── editor_agent.py        # HTML optimization agent
│       ├── url_policy.py          # URL safety checks
│       └── models.py              # SQLAlchemy models
├── frontend/
│   ├── app/dashboard/page.tsx     # Dashboard + reliability panel
│   ├── components/                # Results/editor components
│   ├── lib/apiClient.ts           # API client
│   └── types.ts                   # TypeScript contracts
├── OVERVIEW.md
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Groq API key (or Anthropic key for Claude)
- Docker Desktop (optional, recommended for Postgres + multi-worker mode)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium

# Required API key
export GROQ_API_KEY="gsk_..."

# Optional provider switch
# export LLM_PROVIDER=claude
# export ANTHROPIC_API_KEY="sk-ant-..."

# Optional prompt override for Auto-Optimize behavior
# export EDITOR_PROMPT_APPEND="Preserve all existing images and keep original section order."

# Optional retry policy controls
# export JOB_MAX_RETRIES=2
# export JOB_RETRY_INITIAL_SECONDS=60
# export JOB_RETRY_MAX_SECONDS=900

# Optional Postgres switch (recommended for multi-worker concurrency)
# export DATABASE_URL="postgresql://user:pass@localhost:5432/openseo"

# Optional SLO target controls
# export SLO_SCRAPE_SUCCESS_TARGET=99.5
# export SLO_JOB_SUCCESS_TARGET=99.0
# export SLO_P95_MINUTES_TARGET=15
# export WORKER_STALE_SECONDS=90
# export STALE_RUNNING_SECONDS=1800

# Start API
uvicorn main:app --reload --port 8000

# Start external worker in another terminal
python worker.py --heartbeat-seconds 15 --stale-running-seconds 1800
```

API docs: `http://localhost:8000/docs`

Important:
- Worker process is required for durable queue processing and scheduled audits.
- API and worker are intentionally decoupled.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard: `http://localhost:3000`

### Docker Compose (Postgres + API + Worker + Frontend)

```bash
cp .env.example .env
# edit .env and set GROQ_API_KEY

docker compose up --build
```

Services:
- Frontend: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`
- Postgres: `localhost:5432`

The compose stack runs:
- `postgres` (persistent DB volume)
- `backend-api`
- `worker`
- `frontend`

### Hugging Face Spaces (No-Machine Demo)

This repository includes a root `Dockerfile` for single-container demo hosting.

How it works:
- Frontend serves on public Space port (`7860`).
- Backend runs internally on `127.0.0.1:8000`.
- Worker runs in background in the same container.
- Frontend proxies `/api/*` to backend (`frontend/next.config.mjs`).

Deploy steps:
1. Create a new Hugging Face Space with **Docker** SDK.
2. Connect this repository.
3. Add Space Secret: `GROQ_API_KEY`.
4. Build and run.

Demo notes:
- Best for prototype/demo usage.
- Uses SQLite in-container storage (not durable like managed Postgres).

## API Reference

### `POST /api/optimize`

```json
{
  "url": "https://yoursite.com/page",
  "keyword": "best seo tools",
  "goal": "leads",
  "num_competitors": 10
}
```

### `GET /api/history`

Query params: `status`, `keyword`, `url`, `limit`

### `GET /api/history/{id}`

Get one job item with audit/error status.

### `POST /api/bulk/upload`

Upload an `.xlsx` file and enqueue multiple jobs.

Expected columns:
- `url` (required)
- `keyword` (optional)
- `goal` (optional: `leads|awareness|product_info`)
- `num_competitors` (optional: `3-20`)

### `GET /api/editor/{id}`

Get stored HTML artifacts (`source_html`, `optimized_html`).

### `PUT /api/editor/{id}`

Update saved optimized HTML after manual edits.

### `GET /api/export/{id}`

Download HTML artifact.

Query param:
- `version=optimized` (default)
- `version=source`

### `GET /api/schedules`

List scheduled audits.

### `POST /api/schedules`

Create a scheduled audit.

### `PATCH /api/schedules/{id}`

Update schedule fields (`name`, `keyword`, `goal`, `num_competitors`, `interval_minutes`, `next_run_at`, `is_active`).

### `POST /api/schedules/{id}/run-now`

Immediately enqueue one job from schedule.

### `DELETE /api/schedules/{id}`

Deactivate schedule.

### `GET /api/reliability/summary`

Return SLA/SLO reliability summary.

Query params:
- `window_days` (default `30`, range `1..180`)
- `top_n` (default `8`, range `1..20`)

Response includes:
- job/scrape success rates
- queue + due backlog + running jobs
- stale running jobs + DB backend mode
- active workers (heartbeat)
- p95 completion minutes
- top failure codes and domains
- in-app reliability notifications (no external channel integration)

## Performance Audit Toolkit

The repository includes reproducible benchmark and stress harnesses under `backend/perf/`.

Quick examples:

```bash
cd backend
python perf/audit_suite.py api-latency --iterations 120
python perf/audit_suite.py race-claim --workers 8 --jobs 500
python perf/audit_suite.py bulk-stress --rows 2000
python perf/audit_suite.py db-pool --concurrency 64
```

Frontend bundle report:

```bash
cd frontend
npm run build:bundle-report
```

## Roadmap

- [x] Scheduled / recurring audits
- [x] Durable queue worker with retry/backoff
- [x] Bulk `.xlsx` ingestion pipeline
- [x] Reliability summary API + dashboard panel
- [x] Docker Compose setup (Postgres + API + worker + frontend)
- [ ] Export results (CSV, JSON, PDF)
- [ ] SerpAPI integration (production SERP)
- [ ] Multi-page site audit
- [ ] Historical SEO lift tracking
- [ ] Formal Postgres production migration + Alembic migrations

## License

MIT — see [LICENSE](LICENSE)
