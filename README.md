# openSEO AI

Open-source web scraping tool with AI-powered agents. Scrape any page, extract structured data, and get AI summaries — all from a clean dashboard.

## Features

- **Stealth Scraping** — Scrapling + Playwright for adaptive, bot-resistant page fetching
- **AI Agents** — Pluggable agent system (summarize, extract, raw) with OpenAI/Ollama support
- **Job History** — SQLite-backed history with filters by status, agent, URL, and date
- **Async Processing** — Background job processing with real-time status updates
- **Modern Dashboard** — Next.js + Tailwind CSS frontend with dark theme
- **No Auth Required** — Simple setup, no authentication overhead

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Backend | FastAPI (Python) | Async-first, auto-generated API docs |
| Scraping | Scrapling + Playwright | Adaptive scraping, stealth headers |
| AI Agents | Python + OpenAI / Ollama | Runs inside backend tasks |
| Database | SQLite | No server needed, zero config |
| ORM | SQLAlchemy 2.x | Type-safe models |
| Frontend | Next.js + TypeScript | Modern, type-safe dashboard |
| Styling | Tailwind CSS | Utility-first, dark theme |
| License | MIT | Fully open-source |

## Project Structure

```
openSEO-AI/
├── backend/
│   ├── main.py                    # FastAPI app + routes
│   ├── database.py                # SQLite session + setup
│   ├── routes/
│   │   ├── scrape.py              # POST /api/scrape
│   │   └── history.py             # GET /api/history
│   ├── scrapling_core/
│   │   ├── engine.py              # Scrapling + Playwright + agents
│   │   └── models.py              # SQLAlchemy models
│   └── requirements.txt
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx             # Root layout
│   │   ├── page.tsx               # Landing page
│   │   └── dashboard/page.tsx     # Main dashboard
│   ├── components/
│   │   └── TableResults.tsx       # Results table
│   ├── lib/
│   │   └── apiClient.ts           # API client
│   ├── types.ts                   # TypeScript interfaces
│   ├── tailwind.config.ts
│   └── package.json
│
├── LICENSE
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm or yarn

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium

# Start the API server
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000` with interactive docs at `http://localhost:8000/docs`.

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

## API Reference

### `POST /api/scrape`

Submit a new scrape job.

**Request body:**

```json
{
  "url": "https://example.com",
  "agent": "summarize",
  "config": {}
}
```

**Agent types:**

| Agent | Description |
|-------|-------------|
| `summarize` | Returns title, headings, word count, and a 200-word snippet |
| `extract` | Returns all structured data including full body text |
| `raw` | Returns the raw scraped data as-is |

**Response:**

```json
{
  "id": 1,
  "url": "https://example.com",
  "agent": "summarize",
  "status": "pending",
  "message": "Scrape job submitted. Check /api/history for results."
}
```

### `GET /api/history`

List past scrape jobs with optional filters.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by: `pending`, `running`, `done`, `failed` |
| `agent` | string | Filter by agent type |
| `url` | string | Filter by URL (partial match) |
| `limit` | int | Max results (default: 50, max: 200) |

### `GET /api/history/{job_id}`

Get a single scrape job by ID.

## How It Works

1. **User opens dashboard** — Next.js loads and fetches job history via `GET /api/history`
2. **User submits a scrape** — `POST /api/scrape` creates a job in SQLite (status: `pending`)
3. **Backend processes** — Scrapling + Playwright fetches the page, AI agent processes content
4. **Job completes** — Status updates to `done` (or `failed`), results stored in SQLite
5. **Dashboard updates** — User can view results, re-run, filter, and export

## Contributing

Contributions are welcome! Here's how:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## Roadmap

- [ ] OpenAI / Ollama integration for AI-powered summaries
- [ ] Scheduled / recurring scrape jobs
- [ ] Export results (CSV, JSON)
- [ ] Docker Compose for one-command setup
- [ ] Rate limiting and job queue (Redis)
- [ ] Authentication (optional)

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
