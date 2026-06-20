"""Pydantic schemas for the sensors module."""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.sensor import SensorStatus, SensorType


# ── Request Schemas ──────────────────────────────────────────────────

class SensorCreate(BaseModel):
    """Body for POST /sensors (admin)."""

    equipment_id: UUID = Field(..., description="Owning asset id")
    channel_name: str = Field(..., min_length=1, max_length=30, description="Channel key, e.g. TP2")
    display_name: str = Field(..., min_length=1, max_length=80, description="Human-readable name")
    sensor_type: SensorType = Field(..., description="analog | digital")
    unit: Optional[str] = Field(None, max_length=10, description="Measurement unit")
    min_range: Optional[float] = Field(None, description="Expected minimum value")
    max_range: Optional[float] = Field(None, description="Expected maximum value")
    is_hardware_connected: bool = Field(False, description="Backed by a physical bench sensor")
    status: SensorStatus = Field(SensorStatus.ONLINE, description="Operational state")


# ── Response Schemas ─────────────────────────────────────────────────

class SensorResponse(BaseModel):
    """Full sensor representation."""

    id: UUID
    equipment_id: UUID
    channel_name: str
    display_name: str
    sensor_type: SensorType
    unit: Optional[str] = None
    min_range: Optional[float] = None
    max_range: Optional[float] = None
    is_hardware_connected: bool
    status: SensorStatus

    class Config:
        from_attributes = True
