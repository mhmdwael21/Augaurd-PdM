"""Pydantic schemas for the notifications module."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.notification import NotificationType, RecipientType


# ── Request Schemas ──────────────────────────────────────────────────

class NotificationCreate(BaseModel):
    """Body for POST /notifications.

    Validation rules enforced by ``validate_recipient_fields``:
    - ``recipient_type='user'``  → ``recipient_id`` required, ``target_role`` must be null.
    - ``recipient_type='group'`` → ``target_role`` required, ``recipient_id`` must be null.
    - ``recipient_type='all'``   → both ``recipient_id`` and ``target_role`` must be null.
    - ``type='alert'``           → ``alert_id`` required.
    """

    subject: str = Field(..., min_length=1, max_length=200, description="Notification subject")
    body: str = Field(..., min_length=1, description="Notification body text")
    recipient_type: RecipientType = Field(..., description="Target: user, group, or all")
    recipient_id: Optional[UUID] = Field(
        None, description="Target user ID (required when recipient_type is 'user')"
    )
    target_role: Optional[str] = Field(
        None, description="Target role name (required when recipient_type is 'group')"
    )
    type: NotificationType = Field(
        NotificationType.SYSTEM, description="Notification category"
    )
    alert_id: Optional[UUID] = Field(
        None, description="Linked alert ID (required when type is 'alert')"
    )

    @model_validator(mode="after")
    def validate_recipient_fields(self):
        """Enforce field requirements based on recipient_type and type."""
        rt = self.recipient_type

        if rt == RecipientType.USER:
            if self.recipient_id is None:
                raise ValueError("recipient_id is required when recipient_type is 'user'")
            if self.target_role is not None:
                raise ValueError("target_role must be null when recipient_type is 'user'")

        elif rt == RecipientType.GROUP:
            if self.target_role is None:
                raise ValueError("target_role is required when recipient_type is 'group'")
            if self.recipient_id is not None:
                raise ValueError("recipient_id must be null when recipient_type is 'group'")

        elif rt == RecipientType.ALL:
            if self.recipient_id is not None:
                raise ValueError("recipient_id must be null when recipient_type is 'all'")
            if self.target_role is not None:
                raise ValueError("target_role must be null when recipient_type is 'all'")

        if self.type == NotificationType.ALERT and self.alert_id is None:
            raise ValueError("alert_id is required when type is 'alert'")

        return self


# ── Response Schemas ─────────────────────────────────────────────────

class NotificationResponse(BaseModel):
    """Full notification representation returned by all endpoints."""

    id: UUID
    subject: str
    body: str
    recipient_type: RecipientType
    recipient_id: Optional[UUID] = None
    target_role: Optional[str] = None
    created_by: UUID
    timestamp: datetime
    is_read: bool
    type: NotificationType
    alert_id: Optional[UUID] = None

    class Config:
        from_attributes = True
