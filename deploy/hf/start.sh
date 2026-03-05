#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-7860}"

cd /app/backend
python worker.py \
  --poll-seconds 2 \
  --schedule-check-seconds 30 \
  --heartbeat-seconds 15 \
  --stale-running-seconds "${STALE_RUNNING_SECONDS:-1800}" \
  --recovery-check-seconds 60 &

uvicorn main:app --host 127.0.0.1 --port 8000 &

cd /app/frontend
exec npm run start -- --hostname 0.0.0.0 --port "${PORT}"
