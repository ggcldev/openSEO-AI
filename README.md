# openSEO AI

Open-source AI-powered SEO on-page optimization tool. Analyze any page against top SERP competitors and get actionable recommendations — title tags, meta descriptions, headings, keyword density, content gaps, and prioritized fixes.

## How It Works

1. **Enter your URL** + optional primary keyword
2. **SERP analysis** — fetches top 10 Google results for your keyword
3. **Page scraping** — scrapes your page + all competitors using Scrapling + Playwright
4. **Content analysis** — keyword density, word count, heading structure, entity extraction
5. **AI audit** — Groq/Claude agent produces a full on-page SEO audit with scored metrics and prioritized recommendations
6. **Dashboard** — view results, scores, gaps, and specific actions to take

## Features

- Full on-page SEO audit (title, meta, H1/H2, keyword density, word count, content gaps)
- SERP top-10 competitor analysis
- Stealth scraping with Scrapling + Playwright
- AI-powered recommendations via Groq (free) or Claude
- Job history with filters and auto-refresh
- Modern dark-theme dashboard
- No authentication required
- 100% open-source (MIT)

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI (Python) |
| Scraping | Scrapling + Playwright |
| AI Agent | LangChain + Groq / Claude |
| NLP | YAKE (keyword extraction) |
| Database | SQLite + SQLAlchemy |
| Frontend | Next.js + TypeScript |
| Styling | Tailwind CSS |

## Project Structure

```
openSEO-AI/
├── backend/
│   ├── main.py                    # FastAPI app
│   ├── config.py                  # LLM factory (Groq/Claude)
│   ├── database.py                # SQLite setup
│   ├── routes/
│   │   ├── optimize.py            # POST /api/optimize
│   │   └── history.py             # GET /api/history
│   └── scrapling_core/
│       ├── engine.py              # Scrapling + Playwright scraper
│       ├── serp.py                # Google SERP fetcher
│       ├── analyzer.py            # Keyword + content analysis
│       ├── seo_agent.py           # AI audit agent
│       └── models.py              # SQLAlchemy models
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx               # Landing page
│   │   └── dashboard/page.tsx     # SEO dashboard
│   ├── components/
│   │   └── TableResults.tsx       # Audit results table
│   ├── lib/apiClient.ts           # API client
│   └── types.ts                   # TypeScript types
│
├── LICENSE (MIT)
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Groq API key (free at [console.groq.com](https://console.groq.com))

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium

# Set your API key
export GROQ_API_KEY="gsk_..."

# Start the server
uvicorn main:app --reload --port 8000
```

API docs at `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard at `http://localhost:3000`

## API Reference

### `POST /api/optimize`

```json
{
  "url": "https://yoursite.com/page",
  "keyword": "best seo tools",
  "num_competitors": 10
}
```

### `GET /api/history`

Query params: `status`, `keyword`, `url`, `limit`

### `GET /api/history/{id}`

Get a single job with full audit results.

## Switching to Claude

```bash
# Install the package
pip install langchain-anthropic

# Set env vars
export LLM_PROVIDER=claude
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Roadmap

- [ ] Scheduled / recurring audits
- [ ] Export results (CSV, JSON, PDF)
- [ ] Docker Compose setup
- [ ] SerpAPI integration (production SERP)
- [ ] Multi-page site audit
- [ ] Historical score tracking

## License

MIT — see [LICENSE](LICENSE)
