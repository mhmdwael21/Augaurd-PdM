"""Sensors API routes — the channel registry.

Reads open to any authenticated user; creating a sensor is admin-only
(locked Decision G). Thin wrappers over ``sensor_service``.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.sensor_schema import SensorCreate, SensorResponse
from app.services.sensor_service import create_sensor, get_sensor, list_sensors
from app.utils.dependencies import get_current_user, require_role

router = APIRouter(prefix="/sensors", tags=["Sensors"])


# ── GET / ── List sensors (any auth, optional asset filter) ─────────

@router.get(
    "/",
    response_model=List[SensorResponse],
    summary="List sensors (optionally by asset)",
)
async def list_all_sensors(
    equipment_id: Optional[UUID] = Query(None, description="Filter by owning asset"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the sensor registry, optionally filtered to one asset."""
    return list_sensors(db, equipment_id=equipment_id)


# ── GET /{sensor_id} ── Sensor detail ───────────────────────────────

@router.get(
    "/{sensor_id}",
    response_model=SensorResponse,
    summary="Get sensor detail",
)
async def get_sensor_detail(
    sensor_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a single sensor by id."""
    return get_sensor(db, sensor_id)


# ── POST / ── Create sensor (admin) ─────────────────────────────────

@router.post(
    "/",
    response_model=SensorResponse,
    status_code=201,
    summary="Create a new sensor",
)
async def create(
    payload: SensorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Register a new sensor on an asset (admin only)."""
    return create_sensor(db, payload)
