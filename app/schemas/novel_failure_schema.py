from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


# Allowed status values for the lifecycle write.
NOVEL_STATUSES = {"new", "under_review", "confirmed", "dismissed"}


class NovelFailureCandidateResponse(BaseModel):
    id:                     UUID
    alert_id:               Optional[UUID]
    equipment_id:           Optional[UUID]
    detected_at:            datetime
    data_timestamp:         Optional[datetime]
    scenario:               Optional[str]
    anomaly_score:          Optional[float]
    classifier_probability: Optional[float]
    classifier_verdict:     Optional[str]
    fault_type:             Optional[str]
    top_sensors:            Optional[list]
    recommended_action:     Optional[str]
    status:                 str

    model_config = {"from_attributes": True}


class NovelFailureStatusUpdate(BaseModel):
    status: str
