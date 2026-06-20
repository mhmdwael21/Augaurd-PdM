"""Sensor ORM model — the monitored channels as first-class rows.

Today the 15 channels exist only as strings in code (``FEATURE_COLS``) and as a
hardware mapping in ``hardware_ingest.py``. This table makes them queryable
metadata so the UI can show "After-Pump Pressure (TP2) on APU-01" and the broken
TP3 becomes a real ``status=faulty`` row instead of a hardcoded OFFLINE gauge.

GUARDRAIL (locked Decision C): this table is read-only enrichment. The ML
pipeline NEVER reads it — ``FEATURE_COLS`` in app/ml/constants.py stays the only
runtime source of truth for channel identity/order. Purely additive.
"""

import enum
import uuid

from sqlalchemy import Boolean, Column, Enum, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class SensorType(str, enum.Enum):
    """Channel signal type."""

    ANALOG = "analog"
    DIGITAL = "digital"


class SensorStatus(str, enum.Enum):
    """Operational state of a sensor."""

    ONLINE = "online"
    OFFLINE = "offline"
    FAULTY = "faulty"


class Sensor(Base):
    """Sensors table — one row per monitored channel on an asset."""

    __tablename__ = "sensors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    equipment_id = Column(UUID(as_uuid=True), ForeignKey("equipment.id"), nullable=False)
    channel_name = Column(String(30), nullable=False, index=True)  # joins to localizer output
    display_name = Column(String(80), nullable=False)
    sensor_type = Column(Enum(SensorType), nullable=False)
    unit = Column(String(10), nullable=True)
    min_range = Column(Float, nullable=True)
    max_range = Column(Float, nullable=True)
    is_hardware_connected = Column(Boolean, nullable=False, default=False)
    status = Column(Enum(SensorStatus), nullable=False, default=SensorStatus.ONLINE)

    # One channel name per asset.
    __table_args__ = (
        UniqueConstraint("equipment_id", "channel_name", name="uq_sensor_equipment_channel"),
    )

    equipment = relationship("Equipment", lazy="joined")

    def __repr__(self) -> str:
        return f"<Sensor {self.channel_name} ({self.status.value})>"
