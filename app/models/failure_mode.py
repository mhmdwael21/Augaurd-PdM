"""FailureMode ORM model — the FMEA fault catalog.

Each row is a known failure mode (FMEA-style): its category, affected component,
typical symptoms, recommended action, and default severity. This replaces the
hardcoded ``ACTION_MAP`` in app/ml/inference.py with a queryable, extensible
catalog the UI and the alert/work-order flow can read.

Decision A: the inference engine is NOT touched. ``ACTION_MAP`` stays as the
engine's DB-free fallback; the alert→failure_mode lookup happens later in
``decision_service`` (the stamping step), never in the engine. Purely additive.
"""

import enum
import uuid

from sqlalchemy import Column, Enum, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.models.alert import AlertSeverity  # reuse the existing severity set


class FaultCategory(str, enum.Enum):
    """Fault category — clean lowercase form of the localizer's fault_type.

    The localizer emits human strings like "Pressure Fault"; these enum values
    are the normalized form (see ``sensor``/``failure_mode`` service helpers).
    """

    PRESSURE = "pressure"
    THERMAL = "thermal"
    FLOW = "flow"
    DIGITAL = "digital"


class FailureMode(Base):
    """Failure modes table — FMEA catalog of known faults."""

    __tablename__ = "failure_modes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(120), nullable=False)
    fault_category = Column(Enum(FaultCategory), nullable=False, index=True)
    affected_component = Column(String(120), nullable=True)
    typical_symptoms = Column(Text, nullable=True)
    recommended_action = Column(Text, nullable=True)
    severity_default = Column(Enum(AlertSeverity), nullable=True)

    def __repr__(self) -> str:
        return f"<FailureMode {self.name} [{self.fault_category.value}]>"
