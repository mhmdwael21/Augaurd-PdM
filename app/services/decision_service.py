"""Decision layer (Phase 3) — turns an anomaly episode into a persisted alert.

The InferenceEngine state machine emits ``detection.alert_event`` once per
anomaly episode. ``handle_snapshot`` consumes that flag and writes an alert +
broadcast notification to Postgres, authored by the seeded ``smartmetro-ai``
system user. Kept out of the engine so the engine stays DB-free / testable.
"""
import logging
import uuid
from datetime import datetime

from app.core.database import SessionLocal
from app.models.alert import AlertSeverity
from app.models.equipment import APU_01_ID
from app.models.notification import NotificationType, RecipientType
from app.models.user import User, UserRole
from app.schemas.alert_schema import AlertCreate
from app.schemas.notification_schema import NotificationCreate
from app.services.alert_service import create_alert
from app.services.failure_mode_service import get_failure_mode_by_fault_type
from app.services.notification_service import create_notification
from app.services.work_order_service import spawn_work_order_for_alert
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
# Severity comes straight from the engine's IF-score band (detection.alert_severity);
# LOW/MEDIUM are sustained-drift warnings, HIGH/CRITICAL are confirmed anomalies.
_DRIFT_SEVERITIES = {AlertSeverity.LOW, AlertSeverity.MEDIUM}


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
    severity = AlertSeverity(snap["detection"]["alert_severity"])
    score = round(float(snap["anomaly"]["score"]), 4)
    if severity in _DRIFT_SEVERITIES:
        # Sustained drift — below the anomaly threshold, so the LSTM has not run
        # and there is no localized fault to report. Generic, monitor-only text.
        return AlertCreate(
            severity=severity,
            predicted_failure="Sustained drift detected",
            recommended_action=(
                "Monitor the unit — the anomaly score has stayed elevated for "
                "several minutes without confirming a failure."
            ),
            anomaly_score=score,
        )
    action = snap["localization"]["action"] or "Investigate the flagged sensors and recent trend."
    # Persist the localizer's top-3 culprit sensors so the per-alert chart can
    # default to the actually-flagged sensor (rounded for compact storage).
    top3 = [
        {"sensor": p["sensor"], "error": round(float(p["error"]), 4)}
        for p in snap["localization"].get("top3", [])
    ] or None
    return AlertCreate(
        severity=severity,
        predicted_failure=_predicted_failure(snap),
        recommended_action=action,
        anomaly_score=score,
        top_sensors=top3,
    )


def handle_snapshot(snap, scenario=None):
    """If this snapshot fired a band escalation, persist alert + notification.

    The engine sets ``alert_event`` (with ``alert_severity``) when the IF score
    climbs into a new, higher band whose persistence gate is met — LOW/MEDIUM
    for sustained drift, HIGH/CRITICAL for confirmed anomalies. NORMAL and brief
    drifts never fire. Returns the created Alert (or None when there is no event).

    ``scenario`` is the replay scenario active at fire time ("F3"/"F4") — the
    ground-truth label, stored on the alert so the UI never has to guess it from
    the classifier verdict text (verdict != scenario).
    """
    if not snap or not snap.get("detection", {}).get("alert_event"):
        return None

    db = SessionLocal()
    try:
        sys_id = ensure_system_user(db)
        payload = build_alert_payload(snap)
        payload.scenario = scenario
        try:
            payload.data_timestamp = datetime.fromisoformat(snap["timestamp"])
        except (KeyError, ValueError, TypeError):
            payload.data_timestamp = None
        # Asset-centric stamping: every alert comes from the single monitored
        # unit (APU-01); match the localizer fault_type to the FMEA catalog
        # (None for drift alerts with no localization — by design).
        payload.equipment_id = APU_01_ID
        fault_type = snap.get("localization", {}).get("fault_type")
        mode = get_failure_mode_by_fault_type(db, fault_type)
        payload.failure_mode_id = mode.id if mode else None
        alert = create_alert(db, payload, sys_id)
        note = NotificationCreate(
            subject=f"{payload.severity.value.upper()}: {payload.predicted_failure}",
            body=(
                f"{payload.predicted_failure}. {payload.recommended_action} "
                f"(anomaly score {payload.anomaly_score}, status {snap['status']})."
            ),
            recipient_type=RecipientType.ALL,
            type=NotificationType.ALERT,
            alert_id=alert.id,
        )
        create_notification(db, note, sys_id)
        # Auto-spawn a work order for confirmed anomalies (HIGH/CRITICAL only,
        # Decision E). Isolated so a work-order failure can never break the
        # alert/notification flow that already succeeded above.
        if payload.severity in (AlertSeverity.HIGH, AlertSeverity.CRITICAL):
            try:
                spawn_work_order_for_alert(db, alert, sys_id)
            except Exception:
                logger.exception("work-order auto-spawn failed for alert %s", alert.id)
        rul = snap["rul"]
        logger.info(
            "AI alert %s created [%s] %s (score=%.3f, rul=%s, verdict=%s)",
            alert.id, payload.severity.value, payload.predicted_failure,
            snap["anomaly"]["score"],
            f"{rul['hours']:.1f}h" if rul["available"] and rul["hours"] is not None else "n/a",
            snap["classifier"]["verdict"],
        )
        return alert
    finally:
        db.close()
