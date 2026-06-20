"""Spare-part business logic — CRUD, idempotent seed, and stock consumption.

``consume_parts`` records usage (maintenance_parts rows) and decrements stock,
flooring at 0 (Decision: never block a completion over inventory). Called inside
the work-order completion transaction. Low stock is computed (qty <= min) and
shown in the UI — no notification.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.equipment import APU_01_ID
from app.models.maintenance_part import MaintenancePart
from app.models.spare_part import SparePart
from app.schemas.spare_part_schema import (
    PartUsage,
    SparePartCreate,
    SparePartResponse,
    SparePartUpdate,
)


# ── Seed catalog (read-mostly, idempotent) ───────────────────────────
# (part_number, name, qty, min, location, unit_cost, for_apu01)
_SEED_PARTS = [
    ("APU-VSK-100", "Pneumatic valve seal kit",   12, 4, "Depot A — Shelf 1", 38.50, True),
    ("APU-FLT-200", "Air filter element",          6, 3, "Depot A — Shelf 2", 22.00, True),
    ("APU-OIL-300", "Compressor oil (1L)",        20, 6, "Depot A — Shelf 2",  9.75, True),
    ("APU-PSN-400", "Pressure sensor (TP series)", 3, 2, "Depot B — Cabinet 1", 64.00, True),
    ("APU-DVS-500", "Drain valve solenoid",        4, 2, "Depot B — Cabinet 1", 41.20, True),
    ("GEN-ORG-900", "O-ring assortment (generic)",30, 8, "Depot A — Drawer 5",  5.00, False),
]


def to_response(p: SparePart) -> SparePartResponse:
    return SparePartResponse(
        id=p.id,
        part_name=p.part_name,
        part_number=p.part_number,
        quantity_in_stock=p.quantity_in_stock,
        min_stock_level=p.min_stock_level,
        location=p.location,
        unit_cost=p.unit_cost,
        equipment_id=p.equipment_id,
        low_stock=(p.quantity_in_stock <= p.min_stock_level),
    )


# ── CRUD ─────────────────────────────────────────────────────────────

def create_spare_part(db: Session, payload: SparePartCreate) -> SparePart:
    if db.query(SparePart).filter(SparePart.part_number == payload.part_number).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Part number '{payload.part_number}' already exists")
    part = SparePart(**payload.model_dump())
    db.add(part)
    db.commit()
    db.refresh(part)
    return part


def list_spare_parts(db: Session, low_stock: bool = False) -> List[SparePart]:
    parts = db.query(SparePart).order_by(SparePart.part_name.asc()).all()
    if low_stock:
        parts = [p for p in parts if p.quantity_in_stock <= p.min_stock_level]
    return parts


def get_spare_part(db: Session, part_id: UUID) -> SparePart:
    part = db.query(SparePart).filter(SparePart.id == part_id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Spare part not found")
    return part


def update_spare_part(db: Session, part_id: UUID, payload: SparePartUpdate) -> SparePart:
    part = get_spare_part(db, part_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(part, field, value)
    db.commit()
    db.refresh(part)
    return part


# ── Consumption (called inside the WO-completion transaction) ────────

def consume_parts(db: Session, maintenance_record_id: UUID, parts_used: List[PartUsage]) -> None:
    """Record parts used + decrement stock (floored at 0). No commit (caller owns it)."""
    for pu in parts_used:
        part = db.query(SparePart).filter(SparePart.id == pu.spare_part_id).first()
        if not part:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Spare part {pu.spare_part_id} not found")
        qty = max(0, int(pu.quantity))
        db.add(MaintenancePart(
            maintenance_record_id=maintenance_record_id,
            spare_part_id=part.id,
            quantity_used=qty,
        ))
        part.quantity_in_stock = max(0, part.quantity_in_stock - qty)  # floor at 0


# ── Seeding ──────────────────────────────────────────────────────────

def ensure_seed_spare_parts(db: Session) -> None:
    """Idempotently seed the parts catalog (keyed by part_number)."""
    for number, name, qty, minlvl, loc, cost, for_apu in _SEED_PARTS:
        if db.query(SparePart).filter(SparePart.part_number == number).first():
            continue
        db.add(SparePart(
            part_number=number, part_name=name, quantity_in_stock=qty,
            min_stock_level=minlvl, location=loc, unit_cost=cost,
            equipment_id=APU_01_ID if for_apu else None,
        ))
    db.commit()
