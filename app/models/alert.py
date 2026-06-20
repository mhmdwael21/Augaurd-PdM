"""Alert ORM model."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class AlertSeverity(str, enum.Enum):
    """Alert severity levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatus(str, enum.Enum):
    """Alert lifecycle statuses."""

    NEW = "new"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


# ── Lifecycle: allowed forward transitions ───────────────────────────

VALID_TRANSITIONS = {
    AlertStatus.NEW: {AlertStatus.ACKNOWLEDGED},
    AlertStatus.ACKNOWLEDGED: {AlertStatus.RESOLVED},
    AlertStatus.RESOLVED: set(),  # terminal state
}


class Alert(Base):
    """Alerts table — tracks predicted failures and their resolution."""

    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    severity = Column(Enum(AlertSeverity), nullable=False, default=AlertSeverity.MEDIUM)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    predicted_failure = Column(String(255), nullable=False)
    recommended_action = Column(Text, nullable=False)
    status = Column(Enum(AlertStatus), nullable=False, default=AlertStatus.NEW)
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    anomaly_score = Column(Float, nullable=True)
    created_by = Column(String(100), nullable=False, default="system")
    # LSTM localizer top-3 culprit sensors at fire time: [{"sensor","error"}, ...]
    top_sensors = Column(JSON, nullable=True)
    # Actual replay scenario active when the alert fired ("F3"/"F4") — the
    # ground-truth label, NOT inferred from the classifier verdict text.
    scenario = Column(String(10), nullable=True)
    # Replay/data timestamp at fire time — used to window inference_log for the
    # per-alert chart, so each alert (even loop duplicates) owns its own series.
    data_timestamp = Column(DateTime, nullable=True)

    # Relationships
    assigned_user = relationship("User", foreign_keys=[assigned_to], lazy="joined")

    def __repr__(self) -> str:
        return f"<Alert {self.id} [{self.severity.value}] {self.status.value}>"
