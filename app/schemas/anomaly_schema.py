"""Pydantic schemas for the anomaly-detection endpoint."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Replay control ───────────────────────────────────────────────────

class ReplayControl(BaseModel):
    """Body for POST /dashboard/replay. All fields optional — only sent ones apply."""

    playing: Optional[bool] = Field(None, description="Play / pause the replay")
    speed: Optional[float] = Field(None, gt=0, le=16, description="Speed multiplier")
    scenario: Optional[str] = Field(None, description="Scenario to load: 'F3' or 'F4'")
    reset: bool = Field(False, description="Rebuild the engine and restart the scenario")


# ── Response ─────────────────────────────────────────────────────────

class AnomalyStatus(str, Enum):
    """Possible anomaly classification labels."""

    NORMAL = "NORMAL"
    ANOMALY = "ANOMALY"


class AnomalyDetectionResponse(BaseModel):
    """Result returned by the anomaly-detection endpoint."""

    # Sensor readings
    oil_temperature: float = Field(..., description="Oil temperature reading")
    comp: int = Field(..., description="Compressor status indicator")
    dv_electric: int = Field(..., description="Electric DV pressure indicator")
    towers: int = Field(..., description="Cooling towers status indicator")
    mpg: float = Field(..., description="Motor power generator reading")
    lps: float = Field(..., description="Low-pressure switch reading")
    pressure_switch: int = Field(..., description="Pressure switch status indicator")
    oil_level: float = Field(..., description="Oil level reading")
    caudal_impulse: float = Field(..., description="Caudal impulse reading")

    # Anomaly classification
    anomaly_score: float = Field(..., description="Computed anomaly score")
    status: AnomalyStatus = Field(..., description="Classification result")
    threshold: float = Field(..., description="Decision threshold used for classification")
    model_version: str = Field(..., description="Version of the model that produced the score")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="UTC timestamp of the prediction",
    )
# Eexpecited Response (like documentation)
    class Config:
        json_schema_extra = {
            "example": {
                "oil_temperature": 75.5,
                "comp": 1,
                "dv_electric": 0,
                "towers": 1,
                "mpg": 12.3,
                "lps": 0.45,
                "pressure_switch": 1,
                "oil_level": 3.2,
                "caudal_impulse": 0.87,
                "anomaly_score": 0.87,
                "status": "ANOMALY",
                "threshold": 0.65,
                "model_version": "v1.0",
                "timestamp": "2026-02-20T00:00:00",
            }
        }
