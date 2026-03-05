"""
HE SEO Optimizer — FastAPI Backend
Internal SEO optimization tool for Hitachi Energy.
"""
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from embedded_worker import EmbeddedWorker
from routes.bulk import router as bulk_router
from routes.editor import router as editor_router
from routes.export import router as export_router
from routes.history import router as history_router
from routes.optimize import router as optimize_router
from routes.reliability import router as reliability_router
from routes.schedules import router as schedules_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [api] %(message)s")
    init_db()
    embedded_worker = EmbeddedWorker()
    embedded_worker.start()
    try:
        yield
    finally:
        embedded_worker.stop()


app = FastAPI(
    title="HE SEO Optimizer",
    description="Internal SEO optimization tool for Hitachi Energy",
    version="0.3.0",
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
app.include_router(editor_router, prefix="/api")
app.include_router(bulk_router, prefix="/api")
app.include_router(schedules_router, prefix="/api")
app.include_router(reliability_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "HE SEO Optimizer API is running", "docs": "/docs"}
