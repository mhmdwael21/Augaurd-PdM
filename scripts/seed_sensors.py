"""Seed the 15 monitored channels as sensor rows on the live asset (APU-01).

Idempotent. Requires the equipment fleet to exist first (seeds it if missing).
The backend also seeds these on startup; this script is for manual seeding.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import SessionLocal, Base, engine
from app.models.equipment import Equipment  # noqa: F401  (register table)
from app.models.sensor import Sensor  # noqa: F401  (register table)
from app.services.equipment_service import ensure_seed_equipment
from app.services.sensor_service import ensure_seed_sensors

Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    ensure_seed_equipment(db)  # sensors FK the asset — ensure it exists
    before = db.query(Sensor).count()
    ensure_seed_sensors(db)
    sensors = db.query(Sensor).order_by(Sensor.channel_name.asc()).all()
finally:
    db.close()

print(f"sensors seeded ({len(sensors)} total, {len(sensors) - before} new):")
for s in sensors:
    hw = "HW" if s.is_hardware_connected else "  "
    print(f"  {s.channel_name:16} {s.sensor_type.value:7} {s.status.value:7} {hw}  {s.display_name}")
