"""Equipment ORM model — the physical assets being monitored.

New root entity for the asset-centric data model. Today AuGuard monitors a
single implicit machine; this table makes the asset explicit so alerts, sensors,
and logs can belong to a named unit (e.g. "APU-01, Porto Metro — Line B").

Purely additive: no existing table is modified by this model. The fixed seed
UUIDs below let later steps reference the live unit deterministically.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Enum, String
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


# ── Fixed seed UUIDs (stable across runs, like SYSTEM_USER_ID) ───────
# APU-01 is the real MetroPT-3 unit (the only asset with ML data); 02/03 are
# registered-but-idle, to show a fleet-capable schema without faking ML.
APU_01_ID = uuid.UUID("a55e7001-0000-0000-0000-000000000001")
APU_02_ID = uuid.UUID("a55e7001-0000-0000-0000-000000000002")
APU_03_ID = uuid.UUID("a55e7001-0000-0000-0000-000000000003")


class EquipmentStatus(str, enum.Enum):
    """Operational status of an asset."""

    ACTIVE = "active"
    IDLE = "idle"
    MAINTENANCE = "maintenance"
    DECOMMISSIONED = "decommissioned"


class Equipment(Base):
    """Equipment table — monitored assets (air production units)."""

    __tablename__ = "equipment"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_tag = Column(String(30), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    model = Column(String(80), nullable=True)
    location = Column(String(120), nullable=True)
    install_date = Column(Date, nullable=True)
    status = Column(
        Enum(EquipmentStatus), nullable=False, default=EquipmentStatus.ACTIVE
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<Equipment {self.asset_tag} ({self.status.value})>"
