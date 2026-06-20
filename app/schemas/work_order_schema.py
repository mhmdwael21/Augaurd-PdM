"""Pydantic schemas for the work_orders module."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.alert import AlertSeverity
from app.models.work_order import WorkOrderStatus


# ── Request Schemas ──────────────────────────────────────────────────

class WorkOrderCreate(BaseModel):
    """Body for POST /work-orders (admin)."""

    equipment_id: UUID = Field(..., description="Asset the work order is for")
    title: str = Field(..., min_length=1, max_length=200, description="Work order title")
    description: Optional[str] = Field(None, description="Details / scope")
    priority: AlertSeverity = Field(AlertSeverity.MEDIUM, description="Priority")
    alert_id: Optional[UUID] = Field(None, description="Originating alert, if any")
    assigned_to: Optional[UUID] = Field(None, description="Assignee user id")
    due_date: Optional[datetime] = Field(None, description="Due date")


class WorkOrderStatusUpdate(BaseModel):
    """Body for PUT /work-orders/{id}/status."""

    status: WorkOrderStatus = Field(..., description="New status")


class WorkOrderAssign(BaseModel):
    """Body for PUT /work-orders/{id}/assign."""

    assigned_to: UUID = Field(..., description="User id to assign the work order to")


# ── Response Schemas ─────────────────────────────────────────────────

class WorkOrderResponse(BaseModel):
    """Full work-order representation."""

    id: UUID
    alert_id: Optional[UUID] = None
    equipment_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    priority: AlertSeverity
    status: WorkOrderStatus
    assigned_to: Optional[UUID] = None
    assigned_to_username: Optional[str] = None
    created_by: Optional[UUID] = None
    due_date: Optional[datetime] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
