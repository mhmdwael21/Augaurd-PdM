"""Equipment API routes — the asset registry.

Reads are open to any authenticated user; creating an asset is admin-only
(locked Decision G). Thin wrappers over ``equipment_service``.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.equipment_schema import EquipmentCreate, EquipmentResponse
from app.services.equipment_service import (
    create_equipment,
    get_equipment,
    list_equipment,
)
from app.utils.dependencies import get_current_user, require_role

router = APIRouter(prefix="/equipment", tags=["Equipment"])


# ── GET / ── List assets (any authenticated user) ───────────────────

@router.get(
    "/",
    response_model=List[EquipmentResponse],
    summary="List all equipment (assets)",
)
async def list_assets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the full asset registry."""
    return list_equipment(db)


# ── GET /{equipment_id} ── Asset detail ─────────────────────────────

@router.get(
    "/{equipment_id}",
    response_model=EquipmentResponse,
    summary="Get equipment detail",
)
async def get_asset(
    equipment_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a single asset by id."""
    return get_equipment(db, equipment_id)


# ── POST / ── Create asset (admin) ──────────────────────────────────

@router.post(
    "/",
    response_model=EquipmentResponse,
    status_code=201,
    summary="Create a new asset",
)
async def create_asset(
    payload: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Register a new asset (admin only)."""
    return create_equipment(db, payload)
