"""Notification ORM model."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class RecipientType(str, enum.Enum):
    """Target audience for a notification."""

    USER = "user"
    GROUP = "group"
    ALL = "all"


class NotificationType(str, enum.Enum):
    """Category of the notification."""

    ALERT = "alert"
    SYSTEM = "system"
    BROADCAST = "broadcast"


class Notification(Base):
    """Notifications table — admin-sent messages to users, groups, or all."""

    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)

    # ── Targeting ────────────────────────────────────────────────────
    recipient_type = Column(Enum(RecipientType), nullable=False)
    recipient_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    target_role = Column(String(50), nullable=True)

    # ── Metadata ─────────────────────────────────────────────────────
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    is_read = Column(Boolean, nullable=False, default=False)

    # ── Classification & linking ─────────────────────────────────────
    type = Column(Enum(NotificationType), nullable=False, default=NotificationType.SYSTEM)
    alert_id = Column(UUID(as_uuid=True), ForeignKey("alerts.id"), nullable=True)

    # ── Relationships ────────────────────────────────────────────────
    recipient = relationship("User", foreign_keys=[recipient_id], lazy="joined")
    sender = relationship("User", foreign_keys=[created_by], lazy="joined")
    alert = relationship("Alert", foreign_keys=[alert_id], lazy="joined")

    def __repr__(self) -> str:
        return f"<Notification {self.id} [{self.type.value}] → {self.recipient_type.value}>"
