"""Seed the 4-row FMEA catalog (one failure mode per fault category).

Idempotent. The backend also seeds these on startup; this script is for manual
seeding. Actions are migrated from app/ml/inference.py ACTION_MAP.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import SessionLocal, Base, engine
from app.models.failure_mode import FailureMode  # noqa: F401  (register table)
from app.services.failure_mode_service import ensure_seed_failure_modes

Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    before = db.query(FailureMode).count()
    ensure_seed_failure_modes(db)
    modes = db.query(FailureMode).order_by(FailureMode.fault_category.asc()).all()
finally:
    db.close()

print(f"failure modes seeded ({len(modes)} total, {len(modes) - before} new):")
for m in modes:
    sev = m.severity_default.value if m.severity_default else "-"
    print(f"  {m.fault_category.value:9} {sev:8} {m.name}")
