"""Wipe AI-authored alerts/notifications, then repopulate a realistic, aged
history for the Reports/Analytics pages.

Approach: a replay pass is deterministic (same slice + fresh engine => identical
alerts), so we capture the REAL alert payloads from one engine pass per scenario
(F4, F3) and then materialize several dated monitoring episodes from that genuine
output — spread over ~14 days with a realistic lifecycle funnel (older alerts
acknowledged/resolved + assigned, recent ones new/unassigned). Both scenarios,
both severities (MEDIUM + CRITICAL) are represented.
"""
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import SessionLocal, Base, engine
from app.ml.constants import FEATURE_COLS, DATASET_CSV
from app.ml.preprocessing import load_raw_csv, add_failure_label, clean_resample_segment
from app.ml.inference import InferenceEngine
from app.models.alert import Alert, AlertSeverity, AlertStatus
from app.models.notification import Notification, NotificationType, RecipientType
from app.models.user import User, UserRole
from app.services.decision_service import build_alert_payload, ensure_system_user, SYSTEM_USER_ID

Base.metadata.create_all(bind=engine)
random.seed(7)

WARMUP = 360
SCENARIOS = {"F4": ("2020-07-15 11:00", "2020-07-15 17:00"),
             "F3": ("2020-06-05 05:00", "2020-06-05 13:00")}
LEAD = {"F4": timedelta(hours=2, minutes=5), "F3": timedelta(minutes=7)}  # WATCH->FAILURE gap
PASSES = {"F4": 6, "F3": 6}     # dated episodes per scenario
SPAN_DAYS = 14


def capture_episode(name):
    """One real engine pass -> the genuine alerts of a single episode."""
    a, b = SCENARIOS[name]
    sl = DF[(DF.index >= a) & (DF.index <= b)]
    rows = list(zip([str(t) for t in sl.index],
                    sl[FEATURE_COLS].to_numpy(dtype="float32")))
    eng = InferenceEngine()
    for ts, row in rows[:WARMUP]:
        eng.push(row, ts=ts)
    out = []
    for ts, row in rows[WARMUP:]:
        snap = eng.push(row, ts=ts)
        if snap and snap["detection"]["alert_event"]:
            p = build_alert_payload(snap)
            out.append({"severity": p.severity, "tier": snap["status"],
                        "predicted_failure": p.predicted_failure,
                        "recommended_action": p.recommended_action,
                        "score": p.anomaly_score})
    return out


# ── load data + capture the two genuine episodes ─────────────────────
print("loading + preprocessing CSV ...")
DF = clean_resample_segment(add_failure_label(load_raw_csv(DATASET_CSV)))
TEMPLATES = {name: capture_episode(name) for name in SCENARIOS}
for name, ep in TEMPLATES.items():
    print(f"  {name} episode: " + " -> ".join(f"{a['tier']}/{a['severity'].value}" for a in ep))

db = SessionLocal()
sys_id = ensure_system_user(db)
tech = db.query(User).filter(User.username == "technician").first()
oper = db.query(User).filter(User.username == "operator").first()
assignees = [u.id for u in (tech, oper) if u]

# ── WIPE AI-authored rows (notifications first: FK to alerts) ─────────
sys_alert_ids = [a.id for a in db.query(Alert).filter(Alert.created_by == str(sys_id)).all()]
n_notif = db.query(Notification).filter(
    (Notification.created_by == sys_id) | (Notification.alert_id.in_(sys_alert_ids))
).delete(synchronize_session=False)
n_alert = db.query(Alert).filter(Alert.created_by == str(sys_id)).delete(synchronize_session=False)
db.commit()
print(f"\nwiped: {n_alert} alerts, {n_notif} notifications (created_by={sys_id})")

# ── build dated episode start-times spread across the window ──────────
now = datetime.utcnow()
episodes = []   # (scenario, start_time)
for name, n in PASSES.items():
    for i in range(n):
        # spread within the span with jitter so they don't line up
        frac = (i + random.uniform(0.1, 0.9)) / n
        start = now - timedelta(days=SPAN_DAYS * (1 - frac)) - timedelta(hours=random.uniform(0, 6))
        episodes.append((name, start))
episodes.sort(key=lambda e: e[1])


def lifecycle(ts):
    """Realistic funnel by age: old -> resolved, mid -> acknowledged, new -> new."""
    age = (now - ts).days
    if age >= 9:
        return AlertStatus.RESOLVED, True
    if age >= 3:
        return AlertStatus.ACKNOWLEDGED, True
    return AlertStatus.NEW, False


created = {"F4": {"medium": 0, "critical": 0}, "F3": {"medium": 0, "critical": 0}}
for name, start in episodes:
    for k, tmpl in enumerate(TEMPLATES[name]):
        at = start if tmpl["tier"] == "WATCH" else start + LEAD[name]
        st, assign = lifecycle(at)
        assigned_to = random.choice(assignees) if (assign and assignees) else None
        alert = Alert(
            severity=tmpl["severity"],
            timestamp=at,
            predicted_failure=tmpl["predicted_failure"],
            recommended_action=tmpl["recommended_action"],
            status=st,
            assigned_to=assigned_to,
            anomaly_score=round(min(1.0, max(0.0, tmpl["score"] + random.uniform(-0.02, 0.02))), 4),
            created_by=str(sys_id),
        )
        db.add(alert)
        db.flush()  # get alert.id
        db.add(Notification(
            subject=f"{tmpl['severity'].value.upper()}: {tmpl['predicted_failure']}",
            body=(f"Auto-detected on the APU. {tmpl['recommended_action']} "
                  f"(anomaly score {alert.anomaly_score}, tier {tmpl['tier']})."),
            recipient_type=RecipientType.ALL,
            type=NotificationType.ALERT,
            alert_id=alert.id,
            created_by=sys_id,
            timestamp=at,
            is_read=(st != AlertStatus.NEW),
        ))
        created[name][tmpl["severity"].value] += 1
db.commit()

# ── summary ──────────────────────────────────────────────────────────
def count(col, vals):
    return {v: db.query(Alert).filter(Alert.created_by == str(sys_id), col == v).count() for v in vals}

total = db.query(Alert).filter(Alert.created_by == str(sys_id)).count()
notifs = db.query(Notification).filter(Notification.created_by == sys_id).count()
rng = db.query(Alert).filter(Alert.created_by == str(sys_id))
oldest = rng.order_by(Alert.timestamp.asc()).first().timestamp
newest = rng.order_by(Alert.timestamp.desc()).first().timestamp

print("\n" + "=" * 60)
print("DB HISTORY SUMMARY (AI-authored, created_by=auguard-ai)")
print("=" * 60)
print(f"total alerts      : {total}    notifications: {notifs}")
print(f"by scenario/tier  : F4 {created['F4']}   F3 {created['F3']}")
print(f"by severity       : {count(Alert.severity, [AlertSeverity.MEDIUM, AlertSeverity.CRITICAL])}")
print(f"by status         : {count(Alert.status, [AlertStatus.NEW, AlertStatus.ACKNOWLEDGED, AlertStatus.RESOLVED])}")
print(f"assigned / unassigned : "
      f"{db.query(Alert).filter(Alert.created_by==str(sys_id), Alert.assigned_to.isnot(None)).count()}"
      f" / {db.query(Alert).filter(Alert.created_by==str(sys_id), Alert.assigned_to.is_(None)).count()}")
print(f"timestamp range   : {oldest:%Y-%m-%d %H:%M} -> {newest:%Y-%m-%d %H:%M}  ({(newest-oldest).days}d span)")
db.close()
print("done.")
