"""Phase 4 HTTP verification — replay engine, controls, auth, CSV upload."""
import io
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
import requests

from app.ml.constants import DATASET_CSV
from app.core.database import SessionLocal
from app.models.alert import Alert
from app.services.decision_service import SYSTEM_USER_ID

BASE = "http://127.0.0.1:8012"


def wait_up(timeout=90):
    for _ in range(timeout):
        try:
            r = requests.get(BASE + "/dashboard", timeout=5)
            if r.ok:
                return r.json()
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("server not up")


print("waiting for server ...")
snap = wait_up()
print("  up | status:", snap.get("status"), "| replay:", snap.get("replay"))

# token (login; register admin if needed)
r = requests.post(BASE + "/auth/login", json={"username": "admin", "password": "admin123"})
if not r.ok:
    requests.post(BASE + "/auth/register", json={
        "username": "admin", "email": "admin@auguard.local",
        "password": "admin123", "role": "admin"})
    r = requests.post(BASE + "/auth/login", json={"username": "admin", "password": "admin123"})
tok = r.json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
print("token: ok")

# auth enforcement
r = requests.post(BASE + "/dashboard/replay", json={"speed": 2})
print(f"control without token -> {r.status_code} (expect 401/403)")

# control: speed up
r = requests.post(BASE + "/dashboard/replay", json={"speed": 16, "playing": True}, headers=H)
print("set speed 16 ->", r.status_code, r.json())

# loop advancing?
c1 = requests.get(BASE + "/dashboard").json()["replay"]["cursor"]
time.sleep(3)
c2 = requests.get(BASE + "/dashboard").json()["replay"]["cursor"]
print(f"cursor advanced: {c1} -> {c2}  ({'OK' if c2 != c1 else 'NOT MOVING'})")

# scenario jump
sF3 = requests.post(BASE + "/dashboard/replay", json={"scenario": "F3"}, headers=H).json()
print(f"jump F3 -> scenario={sF3['scenario']} cursor={sF3['cursor']} len={sF3['scenario_len']}")
sF4 = requests.post(BASE + "/dashboard/replay", json={"scenario": "F4"}, headers=H).json()
print(f"jump F4 -> scenario={sF4['scenario']} len={sF4['scenario_len']}")

# background loop should write alerts as it streams through F4
db = SessionLocal()
before = db.query(Alert).filter(Alert.created_by == str(SYSTEM_USER_ID)).count()
db.close()
print(f"AI alerts before: {before} | streaming F4 @16x ~20s ...")
time.sleep(20)
db = SessionLocal()
after = db.query(Alert).filter(Alert.created_by == str(SYSTEM_USER_ID)).count()
db.close()
snap = requests.get(BASE + "/dashboard").json()
print(f"AI alerts after: {after}  (delta +{after - before})")
print(f"now: status={snap.get('status')} score={snap.get('anomaly', {}).get('score')} ts={snap.get('timestamp')}")

# CSV upload
df = pd.read_csv(DATASET_CSV)
df["timestamp"] = pd.to_datetime(df["timestamp"])
sl = df[(df["timestamp"] >= "2020-07-15 13:00") & (df["timestamp"] <= "2020-07-15 15:00")]
buf = io.StringIO()
sl.to_csv(buf, index=False)
r = requests.post(BASE + "/dashboard/upload", headers=H,
                  files={"file": ("slice.csv", buf.getvalue().encode(), "text/csv")})
print("upload ->", r.status_code)
if r.ok:
    j = r.json()
    print("  ", {k: j[k] for k in ["rows_in", "rows_processed", "snapshots",
                                    "peak_score", "anomaly_windows", "alert_episodes", "fault_types"]})
else:
    print("  ", r.text[:300])

print("\nPHASE 4 HTTP CHECK DONE")
