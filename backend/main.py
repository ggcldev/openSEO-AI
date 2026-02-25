"""
HE SEO Optimizer — FastAPI Backend
Internal SEO optimization tool for Hitachi Energy.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routes.optimize import router as optimize_router
from routes.history import router as history_router
from routes.export import router as export_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="HE SEO Optimizer",
    description="Internal SEO optimization tool for Hitachi Energy",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(optimize_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(export_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "HE SEO Optimizer API is running", "docs": "/docs"}
