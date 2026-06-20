from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.alert import Alert
from app.models.inference_log import InferenceLog
from app.schemas.inference_log_schema import (
    InferenceHistoryResponse,
    InferenceStatsResponse,
)

router = APIRouter(prefix="/inference", tags=["inference"])

# Episode window around an alert's firing point (in replay/data time)
EPISODE_BEFORE = timedelta(minutes=60)
EPISODE_AFTER  = timedelta(minutes=20)


@router.get("/history", response_model=InferenceHistoryResponse)
def get_history(
    from_date: Optional[datetime] = Query(None),
    to_date:   Optional[datetime] = Query(None),
    status:    Optional[str]      = Query(None),
    scenario:  Optional[str]      = Query(None),
    limit:     int                = Query(500, le=2000),
    db: Session = Depends(get_db),
):
    q = db.query(InferenceLog)
    if from_date: q = q.filter(InferenceLog.timestamp >= from_date)
    if to_date:   q = q.filter(InferenceLog.timestamp <= to_date)
    if status:    q = q.filter(InferenceLog.status == status)
    if scenario:  q = q.filter(InferenceLog.scenario == scenario)
    total   = q.count()
    entries = q.order_by(InferenceLog.timestamp.asc()).limit(limit).all()
    return InferenceHistoryResponse(total=total, entries=entries)


@router.get("/episode/{alert_id}", response_model=InferenceHistoryResponse)
def get_episode(alert_id: UUID, db: Session = Depends(get_db)):
    """Inference snapshots surrounding the alert's firing point.

    Bridges the two clocks: the alert was created in wall-clock time, the
    snapshot rows are in replay/data time. We window by the alert's stored
    (scenario, data_timestamp) — so every alert, including loop duplicates that
    fire at the same data-time, owns its own series. Older alerts that predate
    this field fall back to the inference_log anchor row. Empty if neither
    exists (graceful in the UI).
    """
    scenario = anchor_ts = None

    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if alert is not None and alert.data_timestamp is not None and alert.scenario:
        scenario, anchor_ts = alert.scenario, alert.data_timestamp
    else:
        anchor = db.query(InferenceLog).filter(InferenceLog.alert_id == alert_id).first()
        if anchor is not None:
            scenario, anchor_ts = anchor.scenario, anchor.timestamp

    if anchor_ts is None:
        return InferenceHistoryResponse(total=0, entries=[])

    lo = anchor_ts - EPISODE_BEFORE
    hi = anchor_ts + EPISODE_AFTER
    entries = (
        db.query(InferenceLog)
        .filter(
            InferenceLog.scenario == scenario,
            InferenceLog.timestamp >= lo,
            InferenceLog.timestamp <= hi,
        )
        .order_by(InferenceLog.timestamp.asc())
        .all()
    )
    return InferenceHistoryResponse(total=len(entries), entries=entries)


@router.get("/stats", response_model=InferenceStatsResponse)
def get_stats(
    scenario: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(InferenceLog)
    if scenario:
        q = q.filter(InferenceLog.scenario == scenario)
    rows = q.all()

    if not rows:
        return InferenceStatsResponse(
            total=0, anomaly_count=0, drift_count=0,
            avg_score=None, zone_distribution={},
            fault_distribution={}, verdict_distribution={},
        )

    scores = [r.anomaly_score for r in rows if r.anomaly_score is not None]
    zone_counts:    dict[str, int] = {}
    fault_counts:   dict[str, int] = {}
    verdict_counts: dict[str, int] = {}
    for r in rows:
        if r.rul_zone:
            zone_counts[r.rul_zone] = zone_counts.get(r.rul_zone, 0) + 1
        if r.fault_type:
            fault_counts[r.fault_type] = fault_counts.get(r.fault_type, 0) + 1
        if r.classifier_verdict:
            verdict_counts[r.classifier_verdict] = verdict_counts.get(r.classifier_verdict, 0) + 1
    zone_total = sum(zone_counts.values())

    return InferenceStatsResponse(
        total=len(rows),
        anomaly_count=sum(1 for r in rows if r.status == "ANOMALY"),
        drift_count=sum(1 for r in rows if r.status == "DRIFT"),
        avg_score=round(sum(scores) / len(scores), 4) if scores else None,
        zone_distribution={
            k: round(v / zone_total * 100, 1) for k, v in zone_counts.items()
        } if zone_total else {},
        fault_distribution=fault_counts,
        verdict_distribution=verdict_counts,
    )
