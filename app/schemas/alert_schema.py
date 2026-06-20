"""Pydantic schemas for the alerts module."""

from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.alert import AlertSeverity, AlertStatus


# ── Request Schemas ──────────────────────────────────────────────────

class AlertCreate(BaseModel):
    """Body for POST /alerts.

    ``status``, ``timestamp``, and ``created_by`` are set automatically.
    """

    severity: AlertSeverity = Field(
        AlertSeverity.MEDIUM, description="Alert severity level"
    )
    predicted_failure: str = Field(
        ..., min_length=1, max_length=255, description="Predicted failure type"
    )
    recommended_action: str = Field(
        ..., min_length=1, description="Recommended corrective action"
    )
    assigned_to: Optional[UUID] = Field(
        None, description="User ID to assign the alert to"
    )
    anomaly_score: Optional[float] = Field(
        None, ge=0.0, le=1.0, description="ML anomaly score (0-1)"
    )
    top_sensors: Optional[List[Any]] = Field(
        None, description="LSTM localizer top-3 culprit sensors at fire time"
    )
    scenario: Optional[str] = Field(
        None, description="Replay scenario active at fire time (F3/F4)"
    )
    data_timestamp: Optional[datetime] = Field(
        None, description="Replay/data timestamp at fire time (for chart windowing)"
    )


class AlertUpdate(BaseModel):
    """Body for PUT /alerts/{id}/status."""

    status: AlertStatus = Field(..., description="New alert status")


class AlertAssign(BaseModel):
    """Body for PUT /alerts/{id}/assign."""

    assigned_to: UUID = Field(..., description="User ID to assign the alert to")


# ── Response Schemas ─────────────────────────────────────────────────

class AlertResponse(BaseModel):
    """Full alert representation."""

    id: UUID
    severity: AlertSeverity
    timestamp: datetime
    predicted_failure: str
    recommended_action: str
    status: AlertStatus
    assigned_to: Optional[UUID] = None
    anomaly_score: Optional[float] = None
    created_by: str
    top_sensors: Optional[List[Any]] = None
    scenario: Optional[str] = None
    data_timestamp: Optional[datetime] = None

    class Config:
        from_attributes = True


class AlertHistoryResponse(BaseModel):
    """Alert representation for the read-only reports/history endpoint.

    Identical to AlertResponse but adds ``assigned_to_username`` resolved
    from the joined ``assigned_user`` relationship — no extra query needed.
    """

    id: UUID
    severity: AlertSeverity
    timestamp: datetime
    predicted_failure: str
    recommended_action: str
    status: AlertStatus
    assigned_to: Optional[UUID] = None
    assigned_to_username: Optional[str] = None
    anomaly_score: Optional[float] = None
    created_by: str
    top_sensors: Optional[List[Any]] = None
    scenario: Optional[str] = None
    data_timestamp: Optional[datetime] = None

    class Config:
        from_attributes = True
