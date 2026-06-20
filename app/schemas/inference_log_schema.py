from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class InferenceLogEntry(BaseModel):
    id:                    UUID
    timestamp:             datetime
    status:                str
    anomaly_score:         Optional[float]
    rul_hours:             Optional[float]
    rul_zone:              Optional[str]
    classifier_verdict:    Optional[str]
    classifier_confidence: Optional[float]
    fault_type:            Optional[str]
    scenario:              str
    alert_id:              Optional[UUID]
    tp2:                   Optional[float]
    tp3:                   Optional[float]
    h1:                    Optional[float]
    dv_pressure:           Optional[float]
    reservoirs:            Optional[float]
    oil_temperature:       Optional[float]
    motor_current:         Optional[float]

    model_config = {"from_attributes": True}


class InferenceHistoryResponse(BaseModel):
    total:   int
    entries: list[InferenceLogEntry]


class InferenceStatsResponse(BaseModel):
    total:                 int
    anomaly_count:         int
    drift_count:           int
    avg_score:             Optional[float]
    zone_distribution:     dict[str, float]
    fault_distribution:    dict[str, int]
    verdict_distribution:  dict[str, int]
