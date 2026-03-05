# Hugging Face Spaces Demo Deployment

This folder contains the run script used by the root `Dockerfile` for a single-container demo deployment.

## What it runs

Inside one container:
- FastAPI backend on `127.0.0.1:8000`
- Background worker process
- Next.js frontend on external `${PORT}` (default `7860`)

The frontend proxies `/api/*` requests to the backend using `frontend/next.config.mjs`.

## Deploy (Docker Space)

1. Create a new Hugging Face Space with **SDK = Docker**.
2. Connect or push this repository.
3. Set required Space Secrets:
   - `GROQ_API_KEY` (required for live optimization calls)
4. Optional variables:
   - `LLM_PROVIDER=groq`
   - `JOB_MAX_RETRIES=2`
   - `JOB_RETRY_INITIAL_SECONDS=60`
   - `JOB_RETRY_MAX_SECONDS=900`
   - `STALE_RUNNING_SECONDS=1800`
5. Start Space build.

## Notes

- This is a demo/prototype runtime path.
- Data uses local SQLite inside the container and may reset on rebuild/sleep.
- For stable production use, move to managed Postgres + separate worker process deployment.
