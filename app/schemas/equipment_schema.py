"""Pydantic schemas for the equipment (assets) module."""

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.equipment import EquipmentStatus


# ── Request Schemas ──────────────────────────────────────────────────

class EquipmentCreate(BaseModel):
    """Body for POST /equipment (admin)."""

    asset_tag: str = Field(..., min_length=1, max_length=30, description="Unique asset tag, e.g. APU-01")
    name: str = Field(..., min_length=1, max_length=120, description="Human-readable name")
    model: Optional[str] = Field(None, max_length=80, description="Equipment model")
    location: Optional[str] = Field(None, max_length=120, description="Physical location")
    install_date: Optional[date] = Field(None, description="Installation date")
    status: EquipmentStatus = Field(
        EquipmentStatus.ACTIVE, description="Operational status"
    )


# ── Response Schemas ─────────────────────────────────────────────────

class EquipmentResponse(BaseModel):
    """Full equipment representation."""

    id: UUID
    asset_tag: str
    name: str
    model: Optional[str] = None
    location: Optional[str] = None
    install_date: Optional[date] = None
    status: EquipmentStatus
    created_at: datetime

    class Config:
        from_attributes = True
