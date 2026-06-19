"""Pydantic schemas for the ESP32 hardware integration.

`HardwareIngest` keys match the Arduino sketch payload EXACTLY
(hardware/sketch_jun15a.ino, loop()):
    after_pump, after_filter, tank   -> int kPa (firmware-clamped to [0, 40])
    raw_ap, raw_af, raw_tk           -> raw HX710B counts (signed)

Sensor mapping (see hardware_ingest.py):
    after_pump -> TP2 (live, pump-side)
    tank       -> Reservoirs (live, on tank)
    after_filter -> TP3 (BROKEN P-Sensor 2 — received but discarded, OFFLINE)
"""
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core import config


class HardwareIngest(BaseModel):
    """One 1 Hz sample from the ESP32. Float-tolerant; firmware sends ints."""

    after_pump: float = Field(..., description="After-pump pressure (kPa) -> TP2 live")
    after_filter: float = Field(..., description="After-filter pressure (kPa) -> TP3 (broken)")
    tank: float = Field(..., description="Tank pressure (kPa) -> Reservoirs live")
    raw_ap: int = Field(..., description="Raw HX710B count, after-pump")
    raw_af: int = Field(..., description="Raw HX710B count, after-filter")
    raw_tk: int = Field(..., description="Raw HX710B count, tank")

    @field_validator("after_pump", "after_filter", "tank")
    @classmethod
    def _in_kpa_range(cls, v: float) -> float:
        lo, hi = config.HARDWARE_KPA_MIN, config.HARDWARE_KPA_MAX
        if not (lo <= v <= hi):
            raise ValueError(f"pressure {v} kPa out of range [{lo}, {hi}]")
        return v


class ManualInjection(BaseModel):
    """Secondary path: set a schematic component's fault state (visualization only)."""

    component: str = Field(..., description="pump | valve_in | valve_out | filter | tank")
    state: str = Field(..., description="NORMAL | FAULT")

    @field_validator("state")
    @classmethod
    def _valid_state(cls, v: str) -> str:
        s = v.upper()
        if s not in ("NORMAL", "FAULT"):
            raise ValueError("state must be NORMAL or FAULT")
        return s


class TriggerConfig(BaseModel):
    """Optional live tuning of the Track B physical trigger. All fields optional."""

    enabled: Optional[bool] = None
    cooldown_s: Optional[float] = Field(None, ge=0)
    scenario: Optional[str] = Field(None, description="'F3' or 'F4'")
