"""Notification business logic."""

from typing import List
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.notification import Notification, RecipientType
from app.models.user import User
from app.schemas.notification_schema import NotificationCreate


def create_notification(
    db: Session,
    payload: NotificationCreate,
    sender_id: UUID,
) -> Notification:
    """Persist a new notification.

    Reusable entry-point — call from routes, other services, or tasks.

    Args:
        db: Active database session.
        payload: Validated notification creation data.
        sender_id: UUID of the admin creating the notification.

    Returns:
        The newly created ``Notification`` instance.
    """
    notification = Notification(
        subject=payload.subject,
        body=payload.body,
        recipient_type=payload.recipient_type,
        recipient_id=payload.recipient_id,
        target_role=payload.target_role,
        type=payload.type,
        alert_id=payload.alert_id,
        created_by=sender_id,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def list_notifications_for_user(db: Session, user: User) -> List[Notification]:
    """Return notifications relevant to the given user.

    A notification is relevant if:
    - Sent directly to the user, **or**
    - Targets the user's role group, **or**
    - Broadcast to everyone.
    """
    return (
        db.query(Notification)
        .filter(
            (
                (Notification.recipient_type == RecipientType.USER)
                & (Notification.recipient_id == user.id)
            )
            | (
                (Notification.recipient_type == RecipientType.GROUP)
                & (Notification.target_role == user.role.value)
            )
            | (Notification.recipient_type == RecipientType.ALL)
        )
        .order_by(Notification.timestamp.desc())
        .all()
    )


def mark_notification_as_read(
    db: Session,
    notification_id: UUID,
    user: User,
) -> Notification:
    """Mark a notification as read (recipient only).

    Raises:
        HTTPException 404: Notification does not exist.
        HTTPException 403: User is not a valid recipient.
    """
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id)
        .first()
    )

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    is_direct = (
        notification.recipient_type == RecipientType.USER
        and notification.recipient_id == user.id
    )
    is_group = (
        notification.recipient_type == RecipientType.GROUP
        and notification.target_role == user.role.value
    )
    is_broadcast = notification.recipient_type == RecipientType.ALL

    if not (is_direct or is_group or is_broadcast):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a recipient of this notification",
        )

    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification
