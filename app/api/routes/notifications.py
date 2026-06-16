"""Notifications API routes — admin sends, all users receive."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.notification_schema import NotificationCreate, NotificationResponse
from app.services.notification_service import (
    create_notification,
    list_notifications_for_user,
    mark_notification_as_read,
)
from app.utils.dependencies import get_current_user, require_role

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)


# ── POST / ── Send notification (admin) ──────────────────────────────

@router.post(
    "/",
    response_model=NotificationResponse,
    status_code=201,
    summary="Send a notification",
)
async def send_notification(
    payload: NotificationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Send a notification to a user, group, or all (admin only)."""
    return create_notification(db, payload, current_user.id)


# ── GET / ── List notifications for current user ─────────────────────

@router.get(
    "/",
    response_model=List[NotificationResponse],
    summary="List my notifications",
)
async def list_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return notifications relevant to the authenticated user."""
    return list_notifications_for_user(db, current_user)


# ── PUT /{id}/read ── Mark notification as read ──────────────────────

@router.put(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Mark notification as read",
)
async def read_notification(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a notification as read (recipient only)."""
    return mark_notification_as_read(db, notification_id, current_user)
