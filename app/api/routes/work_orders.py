"""Work-orders API routes.

RBAC (Decision G): admin creates + assigns; assigned technician/operator (or
admin) advances status; any authenticated user can list/view (role-scoped).
Thin wrappers over ``work_order_service``.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.work_order import WorkOrderStatus
from app.schemas.maintenance_record_schema import (
    MaintenanceRecordResponse,
    WorkOrderComplete,
)
from app.schemas.work_order_schema import (
    WorkOrderAssign,
    WorkOrderCreate,
    WorkOrderResponse,
    WorkOrderStatusUpdate,
)
from app.services.maintenance_record_service import (
    complete_work_order_with_record,
    to_response as maintenance_to_response,
)
from app.services.work_order_service import (
    assign_work_order,
    create_work_order,
    get_work_order,
    list_work_orders,
    to_response,
    update_status,
)
from app.utils.dependencies import get_current_user, require_role

router = APIRouter(prefix="/work-orders", tags=["Work Orders"])


# ── POST / ── Create (admin) ────────────────────────────────────────

@router.post("/", response_model=WorkOrderResponse, status_code=201, summary="Create a work order")
async def create(
    payload: WorkOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    return to_response(create_work_order(db, payload, current_user.id))


# ── GET / ── List (role-aware + filters) ────────────────────────────

@router.get("/", response_model=List[WorkOrderResponse], summary="List work orders")
async def list_all(
    status: Optional[WorkOrderStatus] = Query(None, description="Filter by status"),
    equipment_id: Optional[UUID] = Query(None, description="Filter by asset"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = list_work_orders(db, current_user, status_filter=status, equipment_id=equipment_id)
    return [to_response(w) for w in rows]


# ── GET /{id} ── Detail ─────────────────────────────────────────────

@router.get("/{wo_id}", response_model=WorkOrderResponse, summary="Get work order detail")
async def get_detail(
    wo_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wo = get_work_order(db, wo_id)
    # Non-admins may only view their own work orders.
    if current_user.role != UserRole.ADMIN and wo.assigned_to != current_user.id:
        from fastapi import HTTPException, status as http_status
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="You can only view work orders assigned to you")
    return to_response(wo)


# ── PUT /{id}/status ── Advance status (assigned user or admin) ─────

@router.put("/{wo_id}/status", response_model=WorkOrderResponse, summary="Update work order status")
async def update_wo_status(
    wo_id: UUID,
    payload: WorkOrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return to_response(update_status(db, wo_id, payload.status, current_user))


# ── PUT /{id}/assign ── Assign (admin) ──────────────────────────────

@router.put("/{wo_id}/assign", response_model=WorkOrderResponse, summary="Assign work order")
async def assign(
    wo_id: UUID,
    payload: WorkOrderAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    return to_response(assign_work_order(db, wo_id, payload.assigned_to))


# ── POST /{id}/complete ── Complete + log maintenance (assignee/admin) ──

@router.post("/{wo_id}/complete", response_model=MaintenanceRecordResponse, summary="Complete work order with a maintenance log")
async def complete(
    wo_id: UUID,
    payload: WorkOrderComplete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark an in-progress work order completed and record the maintenance
    performed (action + outcome). The outcome feeds production-precision KPIs."""
    return maintenance_to_response(complete_work_order_with_record(db, wo_id, payload, current_user))
