"""Failure-mode business logic — CRUD, idempotent FMEA seed, and the
localizer-string → catalog lookup the stamping step will use.

The seed migrates the four ``ACTION_MAP`` entries verbatim and enriches them
with the affected component (from ``FAULT_GROUPS``), symptoms, and a default
severity. This module is DB-side only — it does not touch the inference engine.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.alert import AlertSeverity
from app.models.failure_mode import FailureMode, FaultCategory
from app.schemas.failure_mode_schema import FailureModeCreate


# ── FMEA seed (4 rows, one per category — Decision: 4 to start) ──────
# recommended_action is migrated verbatim from app/ml/inference.py ACTION_MAP;
# affected_component summarises the FAULT_GROUPS sensor set for that category.
_SEED_MODES = [
    {
        "name": "Air leak — pneumatic circuit",
        "fault_category": FaultCategory.PRESSURE,
        "affected_component": "Pneumatic circuit (valves, seals, piping)",
        "typical_symptoms": (
            "Pressure fails to hold; abnormal TP2 / TP3 / DV_pressure / Reservoirs "
            "readings; longer or more frequent compressor duty cycles."
        ),
        "recommended_action": "Inspect pneumatic circuit for air leaks — valves, seals, piping.",
        "severity_default": AlertSeverity.HIGH,
    },
    {
        "name": "Overheating — oil cooling / motor load",
        "fault_category": FaultCategory.THERMAL,
        "affected_component": "Oil cooling system & motor",
        "typical_symptoms": "Rising oil temperature and motor current; reduced cooling efficiency.",
        "recommended_action": "Check oil cooling system and motor load.",
        "severity_default": AlertSeverity.HIGH,
    },
    {
        "name": "Airflow restriction — intake / filter",
        "fault_category": FaultCategory.FLOW,
        "affected_component": "Air intake & flow path",
        "typical_symptoms": "Reduced or erratic flow impulses (Caudal_impulses); abnormal H1.",
        "recommended_action": "Inspect flow meters and air intake.",
        "severity_default": AlertSeverity.MEDIUM,
    },
    {
        "name": "Actuator / switch fault",
        "fault_category": FaultCategory.DIGITAL,
        "affected_component": "Discrete actuators & switches",
        "typical_symptoms": (
            "Unexpected state changes across COMP / DV_eletric / Towers / MPG / LPS / "
            "Pressure_switch / Oil_level."
        ),
        "recommended_action": "Verify switch/sensor wiring and actuator states.",
        "severity_default": AlertSeverity.MEDIUM,
    },
]


# ── Localizer string → category normalization ────────────────────────

def normalize_fault_type(fault_type: Optional[str]) -> Optional[FaultCategory]:
    """Map a localizer fault_type ("Pressure Fault") to a FaultCategory.

    Returns None for null/unrecognised input (caller falls back gracefully).
    Used by the stamping step; safe and pure (no DB).
    """
    if not fault_type:
        return None
    head = fault_type.strip().split()[0].lower()  # "Pressure Fault" -> "pressure"
    try:
        return FaultCategory(head)
    except ValueError:
        return None


def get_failure_mode_by_fault_type(db: Session, fault_type: Optional[str]) -> Optional[FailureMode]:
    """Look up the catalog row matching a localizer fault_type. None if no match."""
    category = normalize_fault_type(fault_type)
    if category is None:
        return None
    return db.query(FailureMode).filter(FailureMode.fault_category == category).first()


# ── CRUD ─────────────────────────────────────────────────────────────

def create_failure_mode(db: Session, payload: FailureModeCreate) -> FailureMode:
    """Persist a new failure mode."""
    mode = FailureMode(**payload.model_dump())
    db.add(mode)
    db.commit()
    db.refresh(mode)
    return mode


def list_failure_modes(db: Session) -> List[FailureMode]:
    """Return all failure modes, ordered by category then name."""
    return (
        db.query(FailureMode)
        .order_by(FailureMode.fault_category.asc(), FailureMode.name.asc())
        .all()
    )


def get_failure_mode(db: Session, mode_id: UUID) -> FailureMode:
    """Fetch a single failure mode by id.

    Raises:
        HTTPException 404: If it does not exist.
    """
    mode = db.query(FailureMode).filter(FailureMode.id == mode_id).first()
    if not mode:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Failure mode not found",
        )
    return mode


# ── Seeding ──────────────────────────────────────────────────────────

def ensure_seed_failure_modes(db: Session) -> None:
    """Idempotently seed the 4-row FMEA catalog (keyed by category). Safe to repeat."""
    for spec in _SEED_MODES:
        exists = (
            db.query(FailureMode)
            .filter(FailureMode.fault_category == spec["fault_category"])
            .first()
        )
        if exists:
            continue
        db.add(FailureMode(**spec))
    db.commit()
