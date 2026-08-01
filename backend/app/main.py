from pathlib import Path

from app.api.dataset import router as data_router
from app.api.guava import router as guava_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Project Hollow", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(guava_router)
app.include_router(data_router)
# app.include_router(routes_ws.router)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_FRONTEND_DIST = _PROJECT_ROOT / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    app.mount(
        "/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend"
    )
