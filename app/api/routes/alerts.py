"""Alerts API routes — role-based alert management."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.alert import AlertSeverity, AlertStatus
from app.models.user import User, UserRole
from app.schemas.alert_schema import AlertAssign, AlertCreate, AlertResponse, AlertUpdate
from app.services.alert_service import (
    assign_alert,
    create_alert,
    escalate_alert,
    get_alert,
    list_alerts_for_user,
    list_all_alerts,
    update_alert_status,
)
from app.utils.dependencies import get_current_user, require_role

router = APIRouter(
    prefix="/alerts",
    tags=["Alerts"],
)


# ── POST / ── Create alert (admin) ──────────────────────────────────

@router.post(
    "/",
    response_model=AlertResponse,
    status_code=201,
    summary="Create a new alert",
)
async def create(
    payload: AlertCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Create a new alert (admin only). Optionally assigns to a user."""
    return create_alert(db, payload, current_user.id)


# ── GET / ── List alerts (role-aware + filtering) ────────────────────

@router.get(
    "/",
    response_model=List[AlertResponse],
    summary="List alerts",
)
async def list_alerts(
    status: Optional[AlertStatus] = Query(None, description="Filter by status"),
    severity: Optional[AlertSeverity] = Query(None, description="Filter by severity"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return alerts based on the caller's role.

    - **Admin / Operator**: all alerts (operator is a read-only monitor).
    - **Technician**: only alerts assigned to them (their work queue).

    Supports optional ``?status=`` and ``?severity=`` query filters.
    """
    if current_user.role in (UserRole.ADMIN, UserRole.OPERATOR):
        return list_all_alerts(db, status_filter=status, severity_filter=severity)
    return list_alerts_for_user(
        db, current_user.id, status_filter=status, severity_filter=severity,
    )


# ── GET /{alert_id} ── View single alert ─────────────────────────────

@router.get(
    "/{alert_id}",
    response_model=AlertResponse,
    summary="Get alert details",
)
async def get_alert_detail(
    alert_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a single alert by ID with access control."""
    alert = get_alert(db, alert_id)

    # Technicians can only see alerts assigned to them; admin + operator
    # (read-only monitor) can view any alert.
    if current_user.role == UserRole.TECHNICIAN and alert.assigned_to != current_user.id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="You can only view alerts assigned to you",
        )

    return alert


# ── PUT /{alert_id}/assign ── Assign alert (admin) ──────────────────

@router.put(
    "/{alert_id}/assign",
    response_model=AlertResponse,
    summary="Assign alert to a user",
)
async def assign(
    alert_id: UUID,
    payload: AlertAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Assign an alert to a technician or operator (admin only).

    Validates the target user exists and has an assignable role.
    Sends a notification to the assigned user.
    """
    return assign_alert(db, alert_id, payload.assigned_to, current_user.id)


# ── PUT /{alert_id}/status ── Update status (assigned user) ─────────

@router.put(
    "/{alert_id}/status",
    response_model=AlertResponse,
    summary="Update alert status",
)
async def update_status(
    alert_id: UUID,
    payload: AlertUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update alert status (assigned user only).

    Enforces lifecycle: New -> Acknowledged -> Resolved.
    Backward transitions are rejected.
    """
    return update_alert_status(db, alert_id, payload.status, current_user)


# ── PUT /{alert_id}/escalate ── Escalate alert (admin) ──────────────

@router.put(
    "/{alert_id}/escalate",
    response_model=AlertResponse,
    summary="Escalate alert to critical",
)
async def escalate(
    alert_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Escalate an alert to critical severity (admin only).

    Rejects if already critical. Sends notifications to admins
    and the assigned user.
    """
    return escalate_alert(db, alert_id, current_user.id)
