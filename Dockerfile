FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=7860
ENV BACKEND_INTERNAL_URL=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_URL=

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gnupg ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt \
    && playwright install --with-deps chromium

COPY frontend/package*.json /app/frontend/
RUN cd /app/frontend && npm ci

COPY . /app

RUN cd /app/frontend && npm run build

RUN chmod +x /app/deploy/hf/start.sh

EXPOSE 7860

CMD ["/app/deploy/hf/start.sh"]
