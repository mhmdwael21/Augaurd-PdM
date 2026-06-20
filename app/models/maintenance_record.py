"""MaintenanceRecord ORM model — the log of work actually performed.

Created when a work order is completed (carrying the OUTCOME that closes the
detection→action→feedback loop), or standalone for preventive/inspection work.
The outcome is the ground truth for "was the AI's alert a real failure?" —
aggregated into production precision (Decision H). Purely additive.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class MaintenanceType(str, enum.Enum):
    """Kind of maintenance performed."""

    CORRECTIVE = "corrective"   # fixing a fault (usually from an alert/work order)
    PREVENTIVE = "preventive"   # scheduled, no fault
    INSPECTION = "inspection"   # check only


class MaintenanceOutcome(str, enum.Enum):
    """Result of the work — the model-feedback signal (Decision H)."""

    FAILURE_CONFIRMED = "failure_confirmed"  # real fault found  -> alert = true positive
    NO_FAULT_FOUND = "no_fault_found"        # nothing wrong     -> alert = false positive
    PARTIAL = "partial"                      # partially confirmed
    INCONCLUSIVE = "inconclusive"            # could not determine


class MaintenanceRecord(Base):
    """Maintenance records table — completed-work log + outcome feedback."""

    __tablename__ = "maintenance_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_order_id = Column(UUID(as_uuid=True), ForeignKey("work_orders.id"), nullable=True)
    equipment_id = Column(UUID(as_uuid=True), ForeignKey("equipment.id"), nullable=True)
    performed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    maintenance_type = Column(Enum(MaintenanceType), nullable=False, default=MaintenanceType.CORRECTIVE)
    action_taken = Column(Text, nullable=False)
    outcome = Column(Enum(MaintenanceOutcome), nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    downtime_minutes = Column(Integer, nullable=True)
    labor_cost = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)

    performer = relationship("User", foreign_keys=[performed_by], lazy="joined")
    # Parts consumed (Phase 4). Additive relationship — no column change.
    parts = relationship("MaintenancePart", lazy="selectin")

    def __repr__(self) -> str:
        out = self.outcome.value if self.outcome else "—"
        return f"<MaintenanceRecord {self.id} [{self.maintenance_type.value}] {out}>"
