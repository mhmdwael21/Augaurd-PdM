"""Reports / History API — read-only view of past alert episodes.

Intentionally separate from alerts.py so the live alert management routes
are never touched by the history feature.  All endpoints here are GET-only.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.alert import Alert, AlertSeverity, AlertStatus
from app.models.user import User, UserRole
from app.schemas.alert_schema import AlertHistoryResponse
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/reports", tags=["Reports"])


def _to_history(alert: Alert) -> AlertHistoryResponse:
    """Map an ORM Alert (with joined assigned_user) to AlertHistoryResponse."""
    return AlertHistoryResponse(
        id=alert.id,
        severity=alert.severity,
        timestamp=alert.timestamp,
        predicted_failure=alert.predicted_failure,
        recommended_action=alert.recommended_action,
        status=alert.status,
        assigned_to=alert.assigned_to,
        assigned_to_username=(
            alert.assigned_user.username if alert.assigned_user else None
        ),
        anomaly_score=alert.anomaly_score,
        created_by=alert.created_by,
    )


# ── GET /reports/alerts ── History list ─────────────────────────────

@router.get(
    "/alerts",
    response_model=List[AlertHistoryResponse],
    summary="List alert history",
)
async def list_history(
    from_date: Optional[datetime] = Query(None, description="Start of range (ISO 8601)"),
    to_date: Optional[datetime] = Query(None, description="End of range (ISO 8601)"),
    status: Optional[AlertStatus] = Query(None, description="Filter by status"),
    severity: Optional[AlertSeverity] = Query(None, description="Filter by severity"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AlertHistoryResponse]:
    """Return alert history with optional date, status, and severity filters.

    Admins see all alerts.  Technicians / Operators see only alerts assigned
    to them — same visibility rules as the live Alerts endpoint.
    """
    query = db.query(Alert)

    if current_user.role != UserRole.ADMIN:
        query = query.filter(Alert.assigned_to == current_user.id)

    if from_date:
        query = query.filter(Alert.timestamp >= from_date)
    if to_date:
        query = query.filter(Alert.timestamp <= to_date)
    if status:
        query = query.filter(Alert.status == status)
    if severity:
        query = query.filter(Alert.severity == severity)

    alerts = query.order_by(Alert.timestamp.desc()).all()
    return [_to_history(a) for a in alerts]


# ── GET /reports/alerts/{alert_id} ── Episode detail ────────────────

@router.get(
    "/alerts/{alert_id}",
    response_model=AlertHistoryResponse,
    summary="Get alert episode detail",
)
async def get_history_detail(
    alert_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AlertHistoryResponse:
    """Retrieve a single alert episode by ID.

    Non-admins may only fetch episodes assigned to them.
    """
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    if current_user.role != UserRole.ADMIN and alert.assigned_to != current_user.id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="You can only view episodes assigned to you",
        )

    return _to_history(alert)
