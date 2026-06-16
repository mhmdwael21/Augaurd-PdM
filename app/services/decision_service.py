"""Decision layer (Phase 3) — turns an anomaly episode into a persisted alert.

The InferenceEngine state machine emits ``detection.alert_event`` once per
anomaly episode. ``handle_snapshot`` consumes that flag and writes an alert +
broadcast notification to Postgres, authored by the seeded ``smartmetro-ai``
system user. Kept out of the engine so the engine stays DB-free / testable.
"""
import logging
import uuid

from app.core.database import SessionLocal
from app.models.alert import AlertSeverity
from app.models.notification import NotificationType, RecipientType
from app.models.user import User, UserRole
from app.schemas.alert_schema import AlertCreate
from app.schemas.notification_schema import NotificationCreate
from app.services.alert_service import create_alert
from app.services.notification_service import create_notification
from app.utils.security import hash_password

logger = logging.getLogger(__name__)

SYSTEM_USER_ID = uuid.UUID("a1a1a1a1-0000-0000-0000-000000000001")
SYSTEM_USERNAME = "auguard-ai"
SYSTEM_EMAIL = "ai@auguard.local"
_system_ready = False


def ensure_system_user(db) -> uuid.UUID:
    """Idempotently seed (and keep current) the AI system user.

    Looked up by fixed ID so a username/email rename migrates the existing row
    instead of colliding on the primary key.
    """
    global _system_ready
    if _system_ready:
        return SYSTEM_USER_ID
    user = db.query(User).filter(User.id == SYSTEM_USER_ID).first()
    if user is None:
        user = User(
            id=SYSTEM_USER_ID,
            username=SYSTEM_USERNAME,
            email=SYSTEM_EMAIL,
            password_hash=hash_password(uuid.uuid4().hex),  # not used for login
            role=UserRole.ADMIN,
        )
        db.add(user)
        db.commit()
    elif user.username != SYSTEM_USERNAME or user.email != SYSTEM_EMAIL:
        user.username = SYSTEM_USERNAME
        user.email = SYSTEM_EMAIL
        db.commit()
    _system_ready = True
    return SYSTEM_USER_ID


# ── snapshot -> alert mapping ────────────────────────────────────────
def _severity(snap) -> AlertSeverity:
    score = snap["anomaly"]["score"]
    rul = snap["rul"]
    verdict = snap["classifier"]["verdict"]
    if (rul["available"] and rul["zone"] == "CRITICAL") or score >= 0.85 or verdict == "UNKNOWN":
        return AlertSeverity.CRITICAL
    if score >= 0.75 or (rul["available"] and rul["zone"] == "DEGRADATION"):
        return AlertSeverity.HIGH
    return AlertSeverity.MEDIUM


def _predicted_failure(snap) -> str:
    loc = snap["localization"]
    verdict = snap["classifier"]["verdict"]
    fault = loc["fault_type"] or "Anomaly"
    tops = [p["sensor"] for p in loc["top3"][:2]]
    sensors = " — " + ", ".join(tops) if tops else ""
    prefix = "Novel " if verdict == "UNKNOWN" else ""
    tag = " (UNKNOWN)" if verdict == "UNKNOWN" else " (known signature)" if verdict == "KNOWN" else ""
    return f"{prefix}{fault}{sensors}{tag}"[:255]


def build_alert_payload(snap) -> AlertCreate:
    action = snap["localization"]["action"] or "Investigate the flagged sensors and recent trend."
    return AlertCreate(
        severity=_severity(snap),
        predicted_failure=_predicted_failure(snap),
        recommended_action=action,
        anomaly_score=round(float(snap["anomaly"]["score"]), 4),
    )


def handle_snapshot(snap):
    """If this snapshot latched a new anomaly episode, persist alert + notification.

    Returns the created Alert (or None when there is no event).
    """
    if not snap or not snap.get("detection", {}).get("alert_event"):
        return None

    db = SessionLocal()
    try:
        sys_id = ensure_system_user(db)
        payload = build_alert_payload(snap)
        alert = create_alert(db, payload, sys_id)
        note = NotificationCreate(
            subject=f"{payload.severity.value.upper()}: {payload.predicted_failure}",
            body=(
                f"Auto-detected anomaly on the APU. {payload.recommended_action} "
                f"(anomaly score {payload.anomaly_score}, status {snap['status']})."
            ),
            recipient_type=RecipientType.ALL,
            type=NotificationType.ALERT,
            alert_id=alert.id,
        )
        create_notification(db, note, sys_id)
        logger.info("AI alert %s created (%s)", alert.id, payload.predicted_failure)
        return alert
    finally:
        db.close()
