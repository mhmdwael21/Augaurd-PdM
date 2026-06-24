"""Predictive Maintenance API — application entry-point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.alerts import router as alerts_router
from app.api.routes.anomaly import router as dashboard_router
from app.api.routes.auth import router as auth_router
from app.api.routes.dashboard import router as admin_panel_router
from app.api.routes.equipment import router as equipment_router
from app.api.routes.sensors import router as sensors_router
from app.api.routes.failure_modes import router as failure_modes_router
from app.api.routes.work_orders import router as work_orders_router
from app.api.routes.maintenance_records import router as maintenance_records_router
from app.api.routes.spare_parts import router as spare_parts_router
from app.api.routes.hardware import router as hardware_router
from app.api.routes.inference import router as inference_router
from app.api.routes.novel_failures import router as novel_failures_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.reports import router as reports_router
from app.core.config import MODEL_VERSION, SERVICE_NAME
from app.core.database import Base, engine

# ── Explicit model imports (ensures Base.metadata is fully populated) ─
from app.models.user import User  # noqa: F401
from app.models.alert import Alert  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.inference_log import InferenceLog  # noqa: F401
from app.models.equipment import Equipment, APU_01_ID  # noqa: F401
from app.models.sensor import Sensor  # noqa: F401
from app.models.failure_mode import FailureMode  # noqa: F401
from app.models.work_order import WorkOrder  # noqa: F401
from app.models.maintenance_record import MaintenanceRecord  # noqa: F401
from app.models.spare_part import SparePart  # noqa: F401
from app.models.maintenance_part import MaintenancePart  # noqa: F401
from app.models.novel_failure_candidate import NovelFailureCandidate  # noqa: F401


# ── Lifespan ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle for the application."""
    # Startup: create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    # create_all never ALTERs existing tables — add the new alerts.top_sensors
    # column to the pre-existing table if it's missing (idempotent, Postgres).
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS top_sensors JSON"))
        conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS scenario VARCHAR(10)"))
        conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS data_timestamp TIMESTAMP"))
        # Asset-centric columns (nullable, additive). No FK in DDL — matches the
        # existing loose convention (inference_log.alert_id has no FK either).
        conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS equipment_id UUID"))
        conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS failure_mode_id UUID"))
        conn.execute(text("ALTER TABLE inference_log ADD COLUMN IF NOT EXISTS equipment_id UUID"))
        # Account activation flag (additive). Existing users default to active.
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE"))
        # Backfill any pre-existing rows to the live asset (Decision B). One-time:
        # a no-op once every row is stamped. failure_mode_id is left NULL on old
        # rows by design (can't reverse-engineer fault category from old text).
        conn.execute(
            text("UPDATE alerts SET equipment_id = :a WHERE equipment_id IS NULL"),
            {"a": str(APU_01_ID)},
        )
        conn.execute(
            text("UPDATE inference_log SET equipment_id = :a WHERE equipment_id IS NULL"),
            {"a": str(APU_01_ID)},
        )
    # Seed the demo fleet + the 15 sensor channels — idempotent.
    # Equipment first: sensors FK the asset.
    from app.core.database import SessionLocal
    from app.services.equipment_service import ensure_seed_equipment
    from app.services.sensor_service import ensure_seed_sensors
    from app.services.failure_mode_service import ensure_seed_failure_modes
    from app.services.spare_part_service import ensure_seed_spare_parts
    db = SessionLocal()
    try:
        ensure_seed_equipment(db)
        ensure_seed_sensors(db)
        ensure_seed_failure_modes(db)
        ensure_seed_spare_parts(db)
    finally:
        db.close()
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
app.include_router(equipment_router)
app.include_router(sensors_router)
app.include_router(failure_modes_router)
app.include_router(work_orders_router)
app.include_router(maintenance_records_router)
app.include_router(spare_parts_router)
app.include_router(alerts_router)
app.include_router(notifications_router)
app.include_router(reports_router)
app.include_router(hardware_router)
app.include_router(inference_router)
app.include_router(novel_failures_router)
