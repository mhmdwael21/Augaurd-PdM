"""Work-order business logic — CRUD, lifecycle, RBAC, and alert auto-spawn.

RBAC (Decision G): admin creates/assigns; the assigned technician/operator (or
an admin) advances the status. HIGH/CRITICAL alerts auto-spawn a work order via
``spawn_work_order_for_alert`` (called from decision_service).
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.user import User, UserRole
from app.models.work_order import VALID_TRANSITIONS, WorkOrder, WorkOrderStatus
from app.schemas.work_order_schema import WorkOrderCreate, WorkOrderResponse


# ── Response mapper (resolves assignee username from the joined relation) ──

def to_response(wo: WorkOrder) -> WorkOrderResponse:
    return WorkOrderResponse(
        id=wo.id,
        alert_id=wo.alert_id,
        equipment_id=wo.equipment_id,
        title=wo.title,
        description=wo.description,
        priority=wo.priority,
        status=wo.status,
        assigned_to=wo.assigned_to,
        assigned_to_username=(wo.assigned_user.username if wo.assigned_user else None),
        created_by=wo.created_by,
        due_date=wo.due_date,
        created_at=wo.created_at,
        completed_at=wo.completed_at,
    )


# ── CRUD / lifecycle ─────────────────────────────────────────────────

def create_work_order(db: Session, payload: WorkOrderCreate, creator_id: UUID) -> WorkOrder:
    """Create a work order manually (admin)."""
    wo = WorkOrder(
        alert_id=payload.alert_id,
        equipment_id=payload.equipment_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        assigned_to=payload.assigned_to,
        due_date=payload.due_date,
        created_by=creator_id,
        status=WorkOrderStatus.OPEN,
    )
    db.add(wo)
    db.commit()
    db.refresh(wo)
    return wo


def list_work_orders(
    db: Session,
    user: User,
    status_filter: Optional[WorkOrderStatus] = None,
    equipment_id: Optional[UUID] = None,
) -> List[WorkOrder]:
    """Role-aware list: admin + operator see all (operator is a read-only
    monitor); technician sees only their own assigned queue."""
    query = db.query(WorkOrder)
    if user.role == UserRole.TECHNICIAN:
        query = query.filter(WorkOrder.assigned_to == user.id)
    if status_filter:
        query = query.filter(WorkOrder.status == status_filter)
    if equipment_id:
        query = query.filter(WorkOrder.equipment_id == equipment_id)
    return query.order_by(WorkOrder.created_at.desc()).all()


def get_work_order(db: Session, wo_id: UUID) -> WorkOrder:
    wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")
    return wo


def update_status(db: Session, wo_id: UUID, new_status: WorkOrderStatus, user: User) -> WorkOrder:
    """Advance status. The assigned user or an admin may update; forward-only."""
    wo = get_work_order(db, wo_id)

    if user.role != UserRole.ADMIN and wo.assigned_to != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned user or an admin can update this work order",
        )

    # Completion must go through POST /work-orders/{id}/complete so a maintenance
    # record (with its outcome) is always captured — never a bare status flip.
    if new_status == WorkOrderStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete a work order via POST /work-orders/{id}/complete (with a maintenance log).",
        )

    allowed = VALID_TRANSITIONS.get(wo.status, set())
    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot transition from '{wo.status.value}' to '{new_status.value}'. "
                f"Allowed: {', '.join(s.value for s in allowed) or 'none (terminal state)'}"
            ),
        )

    wo.status = new_status
    if new_status == WorkOrderStatus.COMPLETED:
        wo.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(wo)
    return wo


def assign_work_order(db: Session, wo_id: UUID, target_user_id: UUID) -> WorkOrder:
    """Assign to a technician (admin action)."""
    wo = get_work_order(db, wo_id)

    target = db.query(User).filter(User.id == target_user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found")

    allowed_roles = {UserRole.TECHNICIAN}
    if target.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot assign work orders to role '{target.role.value}'. "
                f"Allowed: {', '.join(r.value for r in allowed_roles)}"
            ),
        )

    wo.assigned_to = target_user_id
    db.commit()
    db.refresh(wo)
    return wo


# ── Alert auto-spawn (called from decision_service for HIGH/CRITICAL) ──

def spawn_work_order_for_alert(db: Session, alert: Alert, created_by: UUID) -> WorkOrder:
    """Create an OPEN work order from a fired alert, pre-filled from its fields."""
    title = f"{alert.severity.value.upper()}: {alert.predicted_failure}"[:200]
    wo = WorkOrder(
        alert_id=alert.id,
        equipment_id=alert.equipment_id,
        title=title,
        description=alert.recommended_action,
        priority=alert.severity,
        status=WorkOrderStatus.OPEN,
        created_by=created_by,
    )
    db.add(wo)
    db.commit()
    db.refresh(wo)
    return wo
