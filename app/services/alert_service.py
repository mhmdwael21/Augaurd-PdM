"""Alert business logic."""

from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertSeverity, AlertStatus, VALID_TRANSITIONS
from app.models.notification import NotificationType, RecipientType
from app.models.user import User, UserRole
from app.schemas.alert_schema import AlertCreate
from app.schemas.notification_schema import NotificationCreate
from app.services.notification_service import create_notification


# ── Notification helper ──────────────────────────────────────────────

def _send_alert_notification(
    db: Session,
    alert: Alert,
    subject: str,
    body: str,
    sender_id: UUID,
    recipient_id: Optional[UUID] = None,
    target_role: Optional[str] = None,
) -> None:
    """Build and persist an alert-linked notification."""
    if recipient_id:
        rt = RecipientType.USER
    elif target_role:
        rt = RecipientType.GROUP
    else:
        rt = RecipientType.ALL

    payload = NotificationCreate(
        subject=subject,
        body=body,
        recipient_type=rt,
        recipient_id=recipient_id,
        target_role=target_role,
        type=NotificationType.ALERT,
        alert_id=alert.id,
    )
    create_notification(db, payload, sender_id)


# ── CRUD / Business logic ───────────────────────────────────────────

def create_alert(db: Session, payload: AlertCreate, creator_id: UUID) -> Alert:
    """Persist a new alert and optionally notify the assigned user.

    Args:
        db: Active database session.
        payload: Alert creation data.
        creator_id: UUID of the admin creating the alert.

    Returns:
        The newly created ``Alert`` instance.
    """
    alert = Alert(
        severity=payload.severity,
        predicted_failure=payload.predicted_failure,
        recommended_action=payload.recommended_action,
        assigned_to=payload.assigned_to,
        anomaly_score=payload.anomaly_score,
        created_by=str(creator_id),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    # Notify assigned user if provided
    if alert.assigned_to:
        _send_alert_notification(
            db, alert,
            subject=f"New alert assigned: {alert.predicted_failure}",
            body=(
                f"A {alert.severity.value} severity alert has been assigned to you.\n"
                f"Action: {alert.recommended_action}"
            ),
            sender_id=creator_id,
            recipient_id=alert.assigned_to,
        )

    return alert


def list_all_alerts(
    db: Session,
    status_filter: Optional[AlertStatus] = None,
    severity_filter: Optional[AlertSeverity] = None,
) -> List[Alert]:
    """Return all alerts with optional filtering (admin view)."""
    query = db.query(Alert)

    if status_filter:
        query = query.filter(Alert.status == status_filter)
    if severity_filter:
        query = query.filter(Alert.severity == severity_filter)

    return query.order_by(Alert.timestamp.desc()).all()


def list_alerts_for_user(
    db: Session,
    user_id: UUID,
    status_filter: Optional[AlertStatus] = None,
    severity_filter: Optional[AlertSeverity] = None,
) -> List[Alert]:
    """Return alerts assigned to a specific user with optional filtering."""
    query = db.query(Alert).filter(Alert.assigned_to == user_id)

    if status_filter:
        query = query.filter(Alert.status == status_filter)
    if severity_filter:
        query = query.filter(Alert.severity == severity_filter)

    return query.order_by(Alert.timestamp.desc()).all()


def get_alert(db: Session, alert_id: UUID) -> Alert:
    """Fetch a single alert by ID.

    Raises:
        HTTPException 404: If the alert does not exist.
    """
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )
    return alert


def assign_alert(
    db: Session,
    alert_id: UUID,
    target_user_id: UUID,
    admin_id: UUID,
) -> Alert:
    """Assign an alert to a user (admin action).

    Validates that the target user exists and has an assignable role
    (technician or operator).

    Raises:
        HTTPException 404: If the alert or target user does not exist.
        HTTPException 400: If the target user has an invalid role.
    """
    alert = get_alert(db, alert_id)

    target_user = db.query(User).filter(User.id == target_user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user not found",
        )

    allowed_roles = {UserRole.TECHNICIAN, UserRole.OPERATOR}
    if target_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot assign alerts to users with role '{target_user.role.value}'. "
                f"Allowed: {', '.join(r.value for r in allowed_roles)}"
            ),
        )

    alert.assigned_to = target_user_id
    db.commit()
    db.refresh(alert)

    # Notify the assigned user
    _send_alert_notification(
        db, alert,
        subject=f"Alert assigned: {alert.predicted_failure}",
        body=(
            f"You have been assigned a {alert.severity.value} severity alert.\n"
            f"Action: {alert.recommended_action}"
        ),
        sender_id=admin_id,
        recipient_id=target_user_id,
    )

    return alert


def update_alert_status(
    db: Session,
    alert_id: UUID,
    new_status: AlertStatus,
    user: User,
) -> Alert:
    """Update alert status with lifecycle enforcement.

    Rules:
        - Only the assigned user may update the status.
        - Only forward transitions are allowed: New -> Acknowledged -> Resolved.

    Raises:
        HTTPException 403: If the user is not the assigned user.
        HTTPException 400: If the status transition is invalid.
        HTTPException 404: If the alert does not exist.
    """
    alert = get_alert(db, alert_id)

    if alert.assigned_to != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned user can update alert status",
        )

    allowed_next = VALID_TRANSITIONS.get(alert.status, set())
    if new_status not in allowed_next:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot transition from '{alert.status.value}' to '{new_status.value}'. "
                f"Allowed: {', '.join(s.value for s in allowed_next) or 'none (terminal state)'}"
            ),
        )

    alert.status = new_status
    db.commit()
    db.refresh(alert)
    return alert


def escalate_alert(db: Session, alert_id: UUID, admin_id: UUID) -> Alert:
    """Escalate an alert to critical severity (admin action).

    Raises:
        HTTPException 400: If the alert is already critical.
        HTTPException 404: If the alert does not exist.
    """
    alert = get_alert(db, alert_id)

    if alert.severity == AlertSeverity.CRITICAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Alert is already at critical severity",
        )

    alert.severity = AlertSeverity.CRITICAL
    db.commit()
    db.refresh(alert)

    # Broadcast critical escalation to all admins
    _send_alert_notification(
        db, alert,
        subject=f"CRITICAL: {alert.predicted_failure}",
        body=(
            f"Alert has been escalated to critical severity.\n"
            f"Action: {alert.recommended_action}"
        ),
        sender_id=admin_id,
        target_role=UserRole.ADMIN.value,
    )

    # Also notify the assigned user if there is one
    if alert.assigned_to:
        _send_alert_notification(
            db, alert,
            subject=f"CRITICAL: {alert.predicted_failure}",
            body=(
                f"An alert assigned to you has been escalated to critical.\n"
                f"Action: {alert.recommended_action}"
            ),
            sender_id=admin_id,
            recipient_id=alert.assigned_to,
        )

    return alert
