"""Pydantic schemas for the failure_modes (FMEA catalog) module."""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.alert import AlertSeverity
from app.models.failure_mode import FaultCategory


# ── Request Schemas ──────────────────────────────────────────────────

class FailureModeCreate(BaseModel):
    """Body for POST /failure-modes (admin)."""

    name: str = Field(..., min_length=1, max_length=120, description="Failure mode name")
    fault_category: FaultCategory = Field(..., description="pressure | thermal | flow | digital")
    affected_component: Optional[str] = Field(None, max_length=120, description="Component affected")
    typical_symptoms: Optional[str] = Field(None, description="Typical observable symptoms")
    recommended_action: Optional[str] = Field(None, description="Recommended corrective action")
    severity_default: Optional[AlertSeverity] = Field(None, description="Default severity")


# ── Response Schemas ─────────────────────────────────────────────────

class FailureModeResponse(BaseModel):
    """Full failure-mode representation."""

    id: UUID
    name: str
    fault_category: FaultCategory
    affected_component: Optional[str] = None
    typical_symptoms: Optional[str] = None
    recommended_action: Optional[str] = None
    severity_default: Optional[AlertSeverity] = None

    class Config:
        from_attributes = True
