"""Failure-modes API routes — the FMEA catalog.

Reads open to any authenticated user; creating a mode is admin-only
(locked Decision G). Thin wrappers over ``failure_mode_service``.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.failure_mode_schema import FailureModeCreate, FailureModeResponse
from app.services.failure_mode_service import (
    create_failure_mode,
    get_failure_mode,
    list_failure_modes,
)
from app.utils.dependencies import get_current_user, require_role

router = APIRouter(prefix="/failure-modes", tags=["Failure Modes"])


# ── GET / ── List failure modes (any authenticated user) ────────────

@router.get(
    "/",
    response_model=List[FailureModeResponse],
    summary="List failure modes (FMEA catalog)",
)
async def list_modes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the full FMEA catalog."""
    return list_failure_modes(db)


# ── GET /{mode_id} ── Failure-mode detail ───────────────────────────

@router.get(
    "/{mode_id}",
    response_model=FailureModeResponse,
    summary="Get failure-mode detail",
)
async def get_mode(
    mode_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a single failure mode by id."""
    return get_failure_mode(db, mode_id)


# ── POST / ── Create failure mode (admin) ───────────────────────────

@router.post(
    "/",
    response_model=FailureModeResponse,
    status_code=201,
    summary="Create a new failure mode",
)
async def create(
    payload: FailureModeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Add a new failure mode to the catalog (admin only)."""
    return create_failure_mode(db, payload)
