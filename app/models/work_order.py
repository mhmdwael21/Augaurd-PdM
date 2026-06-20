"""WorkOrder ORM model — the actionable maintenance task spawned by an alert.

The bridge alert -> work order -> (Phase 3) maintenance record. A HIGH/CRITICAL
alert auto-spawns one (in decision_service); admins can also create them
manually. Purely additive.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.alert import AlertSeverity  # reuse the severity set for priority


class WorkOrderStatus(str, enum.Enum):
    """Work-order lifecycle states."""

    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


# Allowed forward transitions (COMPLETED / CANCELLED are terminal).
VALID_TRANSITIONS = {
    WorkOrderStatus.OPEN: {WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED},
    WorkOrderStatus.IN_PROGRESS: {WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED},
    WorkOrderStatus.COMPLETED: set(),
    WorkOrderStatus.CANCELLED: set(),
}


class WorkOrder(Base):
    """Work orders table — maintenance tasks for an asset."""

    __tablename__ = "work_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_id = Column(UUID(as_uuid=True), ForeignKey("alerts.id"), nullable=True)
    equipment_id = Column(UUID(as_uuid=True), ForeignKey("equipment.id"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(Enum(AlertSeverity), nullable=False, default=AlertSeverity.MEDIUM)
    status = Column(Enum(WorkOrderStatus), nullable=False, default=WorkOrderStatus.OPEN)
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Relationship for display (assignee username). Local to this new table —
    # does not change any existing query behaviour.
    assigned_user = relationship("User", foreign_keys=[assigned_to], lazy="joined")

    def __repr__(self) -> str:
        return f"<WorkOrder {self.id} [{self.priority.value}] {self.status.value}>"
