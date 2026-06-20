"""Reset runtime data — clears the full operational slate.

Wipes alerts, notifications, inference_log, work_orders, and maintenance_records
so the system starts clean. The replay loop repopulates alerts/inference_log
and auto-spawns fresh work orders; maintenance records build up as you complete
work orders through the UI.

KEEPS: users (incl. the auguard-ai system user), equipment, sensors,
failure_modes — i.e. accounts and the seeded reference/registry data.

Deletion is in FK-safe order (children before parents):
  maintenance_records -> work_orders, notifications -> alerts, work_orders -> alerts.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text

from app.core.database import engine

# FK-safe order: delete children before the rows they reference.
#   maintenance_records.work_order_id -> work_orders
#   notifications.alert_id / work_orders.alert_id -> alerts
TABLES = ["maintenance_records", "notifications", "work_orders", "inference_log", "alerts"]

with engine.begin() as conn:
    print("resetting runtime data:")
    for t in TABLES:
        before = conn.execute(text(f"SELECT count(*) FROM {t}")).scalar()
        conn.execute(text(f"DELETE FROM {t}"))
        print(f"  cleared {t:14} ({before} rows deleted)")

print("done — users, equipment, sensors, failure_modes kept.")
