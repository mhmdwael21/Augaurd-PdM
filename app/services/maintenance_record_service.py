"""Maintenance-record business logic — CRUD, KPIs, and atomic WO completion.

The atomic ``complete_work_order_with_record`` creates the maintenance record
AND marks the work order completed in one transaction — so every closed
corrective job carries an outcome (the feedback signal). RBAC mirrors work
orders (admin or the assigned user).
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.maintenance_record import (
    MaintenanceOutcome,
    MaintenanceRecord,
    MaintenanceType,
)
from app.models.user import User, UserRole
from app.models.work_order import WorkOrder, WorkOrderStatus
from app.schemas.maintenance_record_schema import (
    MaintenanceRecordCreate,
    MaintenanceRecordResponse,
    MaintenanceStatsResponse,
    PartLine,
    WorkOrderComplete,
)
from app.services.spare_part_service import consume_parts


# ── Response mapper ──────────────────────────────────────────────────

def to_response(rec: MaintenanceRecord) -> MaintenanceRecordResponse:
    return MaintenanceRecordResponse(
        id=rec.id,
        work_order_id=rec.work_order_id,
        equipment_id=rec.equipment_id,
        performed_by=rec.performed_by,
        performed_by_username=(rec.performer.username if rec.performer else None),
        maintenance_type=rec.maintenance_type,
        action_taken=rec.action_taken,
        outcome=rec.outcome,
        started_at=rec.started_at,
        completed_at=rec.completed_at,
        downtime_minutes=rec.downtime_minutes,
        labor_cost=rec.labor_cost,
        notes=rec.notes,
        parts=[
            PartLine(
                part_name=mp.spare_part.part_name,
                part_number=mp.spare_part.part_number,
                quantity_used=mp.quantity_used,
            )
            for mp in (rec.parts or []) if mp.spare_part is not None
        ],
    )


# ── CRUD ─────────────────────────────────────────────────────────────

def create_maintenance_record(db: Session, payload: MaintenanceRecordCreate, performed_by: UUID) -> MaintenanceRecord:
    """Create a standalone maintenance record (e.g. preventive/inspection)."""
    rec = MaintenanceRecord(
        work_order_id=payload.work_order_id,
        equipment_id=payload.equipment_id,
        performed_by=performed_by,
        maintenance_type=payload.maintenance_type,
        action_taken=payload.action_taken,
        outcome=payload.outcome,
        started_at=payload.started_at,
        downtime_minutes=payload.downtime_minutes,
        labor_cost=payload.labor_cost,
        notes=payload.notes,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def list_maintenance_records(
    db: Session, user: User, equipment_id: Optional[UUID] = None,
) -> List[MaintenanceRecord]:
    """Role-aware list: admin + operator see all (operator is a read-only
    monitor); technician sees only the records they performed."""
    query = db.query(MaintenanceRecord)
    if user.role == UserRole.TECHNICIAN:
        query = query.filter(MaintenanceRecord.performed_by == user.id)
    if equipment_id:
        query = query.filter(MaintenanceRecord.equipment_id == equipment_id)
    return query.order_by(MaintenanceRecord.completed_at.desc()).all()


def get_maintenance_record(db: Session, rec_id: UUID) -> MaintenanceRecord:
    rec = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Maintenance record not found")
    return rec


# ── Atomic: complete a work order + log its maintenance record ───────

def complete_work_order_with_record(
    db: Session, wo_id: UUID, payload: WorkOrderComplete, user: User,
) -> MaintenanceRecord:
    """Mark an in-progress work order completed AND create its maintenance record.

    RBAC: admin or the assigned user. The work order must be in progress.
    """
    wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")

    if user.role != UserRole.ADMIN and wo.assigned_to != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned user or an admin can complete this work order",
        )

    if wo.status != WorkOrderStatus.IN_PROGRESS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Work order must be in progress to complete (current: '{wo.status.value}')",
        )

    now = datetime.utcnow()
    rec = MaintenanceRecord(
        work_order_id=wo.id,
        equipment_id=wo.equipment_id,
        performed_by=user.id,
        maintenance_type=payload.maintenance_type,
        action_taken=payload.action_taken,
        outcome=payload.outcome,
        started_at=wo.created_at,
        completed_at=now,
        downtime_minutes=payload.downtime_minutes,
        labor_cost=payload.labor_cost,
        notes=payload.notes,
    )
    wo.status = WorkOrderStatus.COMPLETED
    wo.completed_at = now
    db.add(rec)
    # Parts consumed: record usage + decrement stock in the SAME transaction.
    if payload.parts_used:
        db.flush()  # assign rec.id before linking parts
        consume_parts(db, rec.id, payload.parts_used)
    db.commit()
    db.refresh(rec)
    return rec


# ── KPIs (Decision H: production precision + MTTR) ───────────────────

def maintenance_stats(db: Session) -> MaintenanceStatsResponse:
    rows = db.query(MaintenanceRecord).all()

    outcome_dist: dict[str, int] = {}
    for r in rows:
        if r.outcome:
            outcome_dist[r.outcome.value] = outcome_dist.get(r.outcome.value, 0) + 1

    confirmed = outcome_dist.get(MaintenanceOutcome.FAILURE_CONFIRMED.value, 0)
    false_pos = outcome_dist.get(MaintenanceOutcome.NO_FAULT_FOUND.value, 0)
    denom = confirmed + false_pos
    precision = round(confirmed / denom * 100, 1) if denom else None

    downtimes = [r.downtime_minutes for r in rows if r.downtime_minutes is not None]
    avg_dt = round(sum(downtimes) / len(downtimes), 1) if downtimes else None

    return MaintenanceStatsResponse(
        total=len(rows),
        outcome_distribution=outcome_dist,
        precision_pct=precision,
        confirmed=confirmed,
        false_positive=false_pos,
        avg_downtime_minutes=avg_dt,
        total_downtime_minutes=sum(downtimes),
    )
