"""Persist ML inference snapshots to the inference_log table.

Deduplication: unique constraint on (timestamp, scenario) + ON CONFLICT DO NOTHING
means the first backend run populates the table; subsequent runs with the same
replay scenario silently skip duplicate rows.
"""
import logging
import uuid
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import SessionLocal
from app.models.equipment import APU_01_ID
from app.models.inference_log import InferenceLog

logger = logging.getLogger(__name__)


def write_snapshot(snap: dict, scenario: str, alert_id=None) -> None:
    ts_str = snap.get("timestamp")
    if not ts_str:
        return
    try:
        ts = datetime.fromisoformat(ts_str)
    except Exception:
        return

    sensors = snap.get("sensors", {}).get("values", {})
    rul     = snap.get("rul", {})
    clf     = snap.get("classifier", {})
    loc     = snap.get("localization", {})

    db = SessionLocal()
    try:
        stmt = (
            pg_insert(InferenceLog)
            .values(
                id=uuid.uuid4(),
                timestamp=ts,
                status=snap.get("status", "NORMAL"),
                anomaly_score=snap.get("anomaly", {}).get("score"),
                rul_hours=rul.get("hours") if rul.get("available") else None,
                rul_zone=rul.get("zone") if rul.get("available") else None,
                classifier_verdict=clf.get("verdict"),
                classifier_confidence=clf.get("confidence"),
                fault_type=loc.get("fault_type"),
                scenario=scenario,
                alert_id=alert_id,
                equipment_id=APU_01_ID,
                tp2=sensors.get("TP2"),
                tp3=sensors.get("TP3"),
                h1=sensors.get("H1"),
                dv_pressure=sensors.get("DV_pressure"),
                reservoirs=sensors.get("Reservoirs"),
                oil_temperature=sensors.get("Oil_temperature"),
                motor_current=sensors.get("Motor_current"),
            )
        )
        # (timestamp, scenario) repeats every replay loop. DO NOTHING would drop
        # the alert_id when the row already exists from earlier sampling, leaving
        # the alert with no anchor. COALESCE stamps the alert_id when one fires
        # and otherwise preserves whatever is already there.
        stmt = stmt.on_conflict_do_update(
            constraint="uq_inference_log_ts_scenario",
            set_={"alert_id": func.coalesce(stmt.excluded.alert_id,
                                            InferenceLog.alert_id)},
        )
        db.execute(stmt)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("inference_log write failed")
    finally:
        db.close()
