"""
openSEO AI — FastAPI Backend
Async-first API for web scraping with AI agent processing.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routes.scrape import router as scrape_router
from routes.history import router as history_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    init_db()
    yield


app = FastAPI(
    title="openSEO AI",
    description="Open-source web scraping + AI agent API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(scrape_router, prefix="/api")
app.include_router(history_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "openSEO AI API is running", "docs": "/docs"}
