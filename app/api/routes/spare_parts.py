"""Spare-parts API routes — MRO inventory.

Reads open to any authenticated user; create/update is admin-only. Stock
consumption happens through work-order completion (not here).
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.spare_part_schema import (
    SparePartCreate,
    SparePartResponse,
    SparePartUpdate,
)
from app.services.spare_part_service import (
    create_spare_part,
    get_spare_part,
    list_spare_parts,
    to_response,
    update_spare_part,
)
from app.utils.dependencies import get_current_user, require_role

router = APIRouter(prefix="/spare-parts", tags=["Spare Parts"])


@router.post("/", response_model=SparePartResponse, status_code=201, summary="Add a spare part")
async def create(
    payload: SparePartCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    return to_response(create_spare_part(db, payload))


@router.get("/", response_model=List[SparePartResponse], summary="List spare parts")
async def list_all(
    low_stock: bool = Query(False, description="Only parts at/below their min level"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [to_response(p) for p in list_spare_parts(db, low_stock=low_stock)]


@router.get("/{part_id}", response_model=SparePartResponse, summary="Get spare part")
async def get_detail(
    part_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return to_response(get_spare_part(db, part_id))


@router.put("/{part_id}", response_model=SparePartResponse, summary="Update / restock a spare part")
async def update(
    part_id: UUID,
    payload: SparePartUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    return to_response(update_spare_part(db, part_id, payload))
