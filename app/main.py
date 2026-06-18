"""Predictive Maintenance API — application entry-point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.alerts import router as alerts_router
from app.api.routes.anomaly import router as dashboard_router
from app.api.routes.auth import router as auth_router
from app.api.routes.dashboard import router as admin_panel_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.reports import router as reports_router
from app.core.config import MODEL_VERSION, SERVICE_NAME
from app.core.database import Base, engine

# ── Explicit model imports (ensures Base.metadata is fully populated) ─
from app.models.user import User  # noqa: F401
from app.models.alert import Alert  # noqa: F401
from app.models.notification import Notification  # noqa: F401


# ── Lifespan ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle for the application."""
    # Startup: create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    # Load ML models + start the background replay loop (model load cost paid here)
    from app.services import replay_service
    replay_service.start()
    yield
    # Shutdown: stop the replay loop cleanly
    replay_service.stop()


# ── Application ──────────────────────────────────────────────────────

app = FastAPI(
    title=SERVICE_NAME,
    version=MODEL_VERSION,
    description="AI-powered predictive maintenance and anomaly detection service.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(admin_panel_router)
app.include_router(dashboard_router)
app.include_router(alerts_router)
app.include_router(notifications_router)
app.include_router(reports_router)
