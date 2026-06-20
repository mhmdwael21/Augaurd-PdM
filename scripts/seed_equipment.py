"""Seed the demo fleet (APU-01 live + APU-02/03 idle) for the asset registry.

Idempotent — re-running only creates the missing assets. The backend also seeds
these on startup, so this script is mainly for manual/standalone seeding.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import SessionLocal, Base, engine
from app.models.equipment import Equipment  # noqa: F401  (register table)
from app.services.equipment_service import ensure_seed_equipment

Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    before = db.query(Equipment).count()
    ensure_seed_equipment(db)
    assets = db.query(Equipment).order_by(Equipment.asset_tag.asc()).all()
finally:
    db.close()

print(f"equipment seeded ({len(assets)} total, {len(assets) - before} new):")
for a in assets:
    print(f"  {a.asset_tag:8} {a.status.value:8} {a.name}")
