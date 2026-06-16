"""Phase 3 done-when test — replay the F4 ramp and confirm the decision engine
auto-writes an alert + linked notification to Postgres."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ml.constants import FEATURE_COLS, DATASET_CSV
from app.ml.preprocessing import load_raw_csv, add_failure_label, clean_resample_segment
from app.ml.inference import InferenceEngine
from app.services.decision_service import handle_snapshot, SYSTEM_USER_ID
from app.core.database import SessionLocal, Base, engine
from app.models.alert import Alert
from app.models.notification import Notification

Base.metadata.create_all(bind=engine)

db = SessionLocal()
before_a = db.query(Alert).filter(Alert.created_by == str(SYSTEM_USER_ID)).count()
before_n = db.query(Notification).filter(Notification.created_by == SYSTEM_USER_ID).count()
db.close()
print(f"before: {before_a} AI alerts, {before_n} AI notifications")

print("driving F4 ramp through engine + decision layer ...")
df = clean_resample_segment(add_failure_label(load_raw_csv(DATASET_CSV)))
sl = df[(df.index >= "2020-07-15 12:00") & (df.index <= "2020-07-15 16:30")]
eng = InferenceEngine()
events = 0
for t, r in zip(sl.index, sl[FEATURE_COLS].values):
    s = eng.push(r, ts=str(t))
    if s and s["detection"]["alert_event"]:
        events += 1
    handle_snapshot(s)
print(f"alert_events fired: {events}")

db = SessionLocal()
after_a = db.query(Alert).filter(Alert.created_by == str(SYSTEM_USER_ID)).count()
after_n = db.query(Notification).filter(Notification.created_by == SYSTEM_USER_ID).count()
print(f"after : {after_a} AI alerts, {after_n} AI notifications")
print(f"delta : +{after_a - before_a} alerts, +{after_n - before_n} notifications")

last = (db.query(Alert).filter(Alert.created_by == str(SYSTEM_USER_ID))
        .order_by(Alert.timestamp.desc()).first())
if last:
    print("\nlatest AI alert:")
    print(f"  severity          : {last.severity.value}")
    print(f"  status            : {last.status.value}")
    print(f"  anomaly_score     : {last.anomaly_score}")
    print(f"  predicted_failure : {last.predicted_failure}")
    print(f"  recommended_action: {last.recommended_action}")
    print(f"  created_by        : {last.created_by}")
    n = db.query(Notification).filter(Notification.alert_id == last.id).first()
    if n:
        print("\nlinked notification:")
        print(f"  type        : {n.type.value}  recipient: {n.recipient_type.value}")
        print(f"  subject     : {n.subject}")
        print(f"  body        : {n.body}")
ok = (after_a - before_a) >= 1 and (after_n - before_n) >= 1
print("\nPHASE 3 DONE-WHEN:", "PASS" if ok else "FAIL")
db.close()
