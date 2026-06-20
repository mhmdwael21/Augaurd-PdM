"""Equipment business logic — CRUD + idempotent fleet seeding.

The asset registry is read-mostly. ``ensure_seed_equipment`` seeds the demo
fleet (1 live + 2 idle) idempotently, mirroring ``ensure_system_user`` and
``seed_users.py``.
"""

from datetime import date
from typing import List
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.equipment import (
    APU_01_ID,
    APU_02_ID,
    APU_03_ID,
    Equipment,
    EquipmentStatus,
)
from app.schemas.equipment_schema import EquipmentCreate


# ── Demo fleet (Decision F: 1 live + 2 idle) ─────────────────────────
# (id, asset_tag, name, model, location, install_date, status)
_SEED_FLEET = [
    (APU_01_ID, "APU-01", "Air Production Unit 01", "MetroPT compressor",
     "Porto Metro — Line B", date(2020, 1, 1), EquipmentStatus.ACTIVE),
    (APU_02_ID, "APU-02", "Air Production Unit 02", "MetroPT compressor",
     "Porto Metro — Line A", None, EquipmentStatus.IDLE),
    (APU_03_ID, "APU-03", "Air Production Unit 03", "MetroPT compressor",
     "Porto Metro — Depot", None, EquipmentStatus.IDLE),
]


# ── CRUD ─────────────────────────────────────────────────────────────

def create_equipment(db: Session, payload: EquipmentCreate) -> Equipment:
    """Persist a new asset. Rejects a duplicate asset_tag."""
    existing = db.query(Equipment).filter(Equipment.asset_tag == payload.asset_tag).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Asset tag '{payload.asset_tag}' already exists",
        )
    asset = Equipment(
        asset_tag=payload.asset_tag,
        name=payload.name,
        model=payload.model,
        location=payload.location,
        install_date=payload.install_date,
        status=payload.status,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def list_equipment(db: Session) -> List[Equipment]:
    """Return all assets, ordered by asset tag."""
    return db.query(Equipment).order_by(Equipment.asset_tag.asc()).all()


def get_equipment(db: Session, equipment_id: UUID) -> Equipment:
    """Fetch a single asset by id.

    Raises:
        HTTPException 404: If the asset does not exist.
    """
    asset = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Equipment not found",
        )
    return asset


# ── Seeding ──────────────────────────────────────────────────────────

def ensure_seed_equipment(db: Session) -> None:
    """Idempotently seed the demo fleet. Safe to call repeatedly."""
    for eid, tag, name, model, location, install, st in _SEED_FLEET:
        if db.query(Equipment).filter(Equipment.id == eid).first():
            continue
        db.add(Equipment(
            id=eid, asset_tag=tag, name=name, model=model,
            location=location, install_date=install, status=st,
        ))
    db.commit()
