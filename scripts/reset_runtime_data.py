"""Reset runtime data — clears alerts, notifications, and inference_log.

Wipes the operational data so the system starts clean with fully-stamped rows
(equipment_id / failure_mode_id) going forward. Deletes in FK-safe order
(notifications reference alerts).

KEEPS: users (incl. the auguard-ai system user), equipment, sensors,
failure_modes — i.e. accounts and the seeded reference/registry data.

Run once after restarting the backend with the stamping changes. The replay
loop will immediately repopulate inference_log (and fire alerts) with the new
asset-centric columns filled in.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text

from app.core.database import engine

# FK-safe order: notifications.alert_id -> alerts.id, so notifications first.
TABLES = ["notifications", "inference_log", "alerts"]

with engine.begin() as conn:
    print("resetting runtime data:")
    for t in TABLES:
        before = conn.execute(text(f"SELECT count(*) FROM {t}")).scalar()
        conn.execute(text(f"DELETE FROM {t}"))
        print(f"  cleared {t:14} ({before} rows deleted)")

print("done — users, equipment, sensors, failure_modes were kept.")
