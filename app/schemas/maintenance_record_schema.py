"""Pydantic schemas for the maintenance_records module."""

from datetime import datetime
from typing import Dict, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.maintenance_record import MaintenanceOutcome, MaintenanceType


# ── Request Schemas ──────────────────────────────────────────────────

class MaintenanceRecordCreate(BaseModel):
    """Body for POST /maintenance-records (standalone, e.g. preventive)."""

    equipment_id: UUID = Field(..., description="Asset serviced")
    work_order_id: Optional[UUID] = Field(None, description="Linked work order, if any")
    maintenance_type: MaintenanceType = Field(MaintenanceType.PREVENTIVE, description="Type")
    action_taken: str = Field(..., min_length=1, description="What was done")
    outcome: Optional[MaintenanceOutcome] = Field(None, description="Result / feedback")
    started_at: Optional[datetime] = Field(None, description="When work started")
    downtime_minutes: Optional[int] = Field(None, ge=0, description="Asset downtime (minutes)")
    labor_cost: Optional[float] = Field(None, ge=0, description="Labor cost")
    notes: Optional[str] = Field(None, description="Free-text notes")


class WorkOrderComplete(BaseModel):
    """Body for POST /work-orders/{id}/complete — completes the WO + logs the record."""

    action_taken: str = Field(..., min_length=1, description="What was done")
    outcome: MaintenanceOutcome = Field(..., description="Result — the feedback signal")
    maintenance_type: MaintenanceType = Field(MaintenanceType.CORRECTIVE, description="Type")
    downtime_minutes: Optional[int] = Field(None, ge=0, description="Asset downtime (minutes)")
    labor_cost: Optional[float] = Field(None, ge=0, description="Labor cost")
    notes: Optional[str] = Field(None, description="Free-text notes")


# ── Response Schemas ─────────────────────────────────────────────────

class MaintenanceRecordResponse(BaseModel):
    """Full maintenance-record representation."""

    id: UUID
    work_order_id: Optional[UUID] = None
    equipment_id: Optional[UUID] = None
    performed_by: Optional[UUID] = None
    performed_by_username: Optional[str] = None
    maintenance_type: MaintenanceType
    action_taken: str
    outcome: Optional[MaintenanceOutcome] = None
    started_at: Optional[datetime] = None
    completed_at: datetime
    downtime_minutes: Optional[int] = None
    labor_cost: Optional[float] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class MaintenanceStatsResponse(BaseModel):
    """Aggregate KPIs across maintenance records."""

    total: int
    outcome_distribution: Dict[str, int]
    # Production precision = failure_confirmed / (failure_confirmed + no_fault_found).
    precision_pct: Optional[float] = None
    confirmed: int
    false_positive: int
    avg_downtime_minutes: Optional[float] = None   # MTTR proxy
    total_downtime_minutes: int
