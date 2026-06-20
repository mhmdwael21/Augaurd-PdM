"""Sensor business logic — CRUD + idempotent seeding of the 15 channels.

The registry is read-mostly. ``ensure_seed_sensors`` materialises the 15
``FEATURE_COLS`` channels as rows on the live asset (APU-01), with display
names, units, and hardware status. It must run AFTER the equipment seed (the
sensors FK the asset).

This module only READS ``FEATURE_COLS`` / ``ANALOG_COLS`` to know channel
identity and order for seeding — it never writes them or feeds the models.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.ml.constants import ANALOG_COLS, FEATURE_COLS
from app.models.equipment import APU_01_ID
from app.models.sensor import Sensor, SensorStatus, SensorType
from app.schemas.sensor_schema import SensorCreate


# ── Channel metadata (display name, unit) ────────────────────────────
# Single source for human-readable sensor metadata. Units from context §12.
_SENSOR_META = {
    # analog (7)
    "TP2":             ("After-Pump Pressure", "bar"),
    "TP3":             ("After-Filter Pressure", "bar"),
    "H1":              ("H1 Pressure", "bar"),
    "DV_pressure":     ("Discharge Valve Pressure", "bar"),
    "Reservoirs":      ("Reservoir Pressure", "bar"),
    "Oil_temperature": ("Oil Temperature", "°C"),
    "Motor_current":   ("Motor Current", "A"),
    # digital (8) — binary 0/1
    "COMP":            ("Compressor State", ""),
    "DV_eletric":      ("Electric Discharge Valve", ""),
    "Towers":          ("Tower Switch", ""),
    "MPG":             ("MPG Sensor", ""),
    "LPS":             ("Low Pressure Switch", ""),
    "Pressure_switch": ("Pressure Switch", ""),
    "Oil_level":       ("Oil Level Switch", ""),
    "Caudal_impulses": ("Flow Impulses", ""),
}

# APU-01 is the dataset-monitored compressor — all 15 channels are healthy data
# channels (status=online). The ESP32 bench prototype's live sensors and its
# broken TP3 gauge are a SEPARATE system, represented only on the Prototype page;
# we do not conflate that hardware status onto the monitored asset's registry.


# ── CRUD ─────────────────────────────────────────────────────────────

def create_sensor(db: Session, payload: SensorCreate) -> Sensor:
    """Persist a new sensor. Rejects a duplicate channel on the same asset."""
    dup = (
        db.query(Sensor)
        .filter(Sensor.equipment_id == payload.equipment_id,
                Sensor.channel_name == payload.channel_name)
        .first()
    )
    if dup:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sensor '{payload.channel_name}' already exists for this asset",
        )
    sensor = Sensor(**payload.model_dump())
    db.add(sensor)
    db.commit()
    db.refresh(sensor)
    return sensor


def list_sensors(db: Session, equipment_id: Optional[UUID] = None) -> List[Sensor]:
    """Return sensors, optionally filtered to one asset."""
    query = db.query(Sensor)
    if equipment_id is not None:
        query = query.filter(Sensor.equipment_id == equipment_id)
    return query.order_by(Sensor.channel_name.asc()).all()


def get_sensor(db: Session, sensor_id: UUID) -> Sensor:
    """Fetch a single sensor by id.

    Raises:
        HTTPException 404: If the sensor does not exist.
    """
    sensor = db.query(Sensor).filter(Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sensor not found",
        )
    return sensor


# ── Seeding ──────────────────────────────────────────────────────────

def ensure_seed_sensors(db: Session) -> None:
    """Idempotently seed the 15 channels on the live asset (APU-01).

    Safe to call repeatedly. Must run after ``ensure_seed_equipment``.
    """
    for ch in FEATURE_COLS:
        exists = (
            db.query(Sensor)
            .filter(Sensor.equipment_id == APU_01_ID, Sensor.channel_name == ch)
            .first()
        )
        if exists:
            continue
        display, unit = _SENSOR_META.get(ch, (ch, None))
        is_analog = ch in ANALOG_COLS
        db.add(Sensor(
            equipment_id=APU_01_ID,
            channel_name=ch,
            display_name=display,
            sensor_type=SensorType.ANALOG if is_analog else SensorType.DIGITAL,
            unit=unit,
            # digital channels are binary 0/1; analog spec range left unknown (null)
            min_range=None if is_analog else 0.0,
            max_range=None if is_analog else 1.0,
            is_hardware_connected=False,  # hardware linkage lives on the Prototype page
            status=SensorStatus.ONLINE,
        ))
    db.commit()
