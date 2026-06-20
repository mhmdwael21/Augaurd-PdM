"""Maintenance-records API routes.

Reads are role-scoped (admin all; tech/operator their own). Any authenticated
user who performs work can log a standalone record. KPIs (precision, MTTR) via
``/stats``. The atomic "complete work order + log" lives on the work-orders
router (`POST /work-orders/{id}/complete`).
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.maintenance_record_schema import (
    MaintenanceRecordCreate,
    MaintenanceRecordResponse,
    MaintenanceStatsResponse,
)
from app.services.maintenance_record_service import (
    create_maintenance_record,
    get_maintenance_record,
    list_maintenance_records,
    maintenance_stats,
    to_response,
)
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/maintenance-records", tags=["Maintenance Records"])


# ── POST / ── Log a standalone record (any authenticated user) ──────

@router.post("/", response_model=MaintenanceRecordResponse, status_code=201, summary="Log a maintenance record")
async def create(
    payload: MaintenanceRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return to_response(create_maintenance_record(db, payload, current_user.id))


# ── GET /stats ── KPIs (declared before /{id} so it isn't shadowed) ─

@router.get("/stats", response_model=MaintenanceStatsResponse, summary="Maintenance KPIs")
async def stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return maintenance_stats(db)


# ── GET / ── List (role-aware) ──────────────────────────────────────

@router.get("/", response_model=List[MaintenanceRecordResponse], summary="List maintenance records")
async def list_all(
    equipment_id: Optional[UUID] = Query(None, description="Filter by asset"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = list_maintenance_records(db, current_user, equipment_id=equipment_id)
    return [to_response(r) for r in rows]


# ── GET /{id} ── Detail ─────────────────────────────────────────────

@router.get("/{record_id}", response_model=MaintenanceRecordResponse, summary="Get maintenance record")
async def get_detail(
    record_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rec = get_maintenance_record(db, record_id)
    if current_user.role != UserRole.ADMIN and rec.performed_by != current_user.id:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="You can only view your own records")
    return to_response(rec)
