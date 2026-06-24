"""Service layer for the Novel Failure Capture feedback loop.

All logic lives here; routes are thin. ``create_candidate`` is the only writer and
is called by ``decision_service.handle_snapshot`` (the single place ML output
becomes DB rows). Reads power the dashboard card and the review list.
"""

import logging
import uuid
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.equipment import APU_01_ID
from app.models.novel_failure_candidate import NovelFailureCandidate
from app.schemas.novel_failure_schema import NOVEL_STATUSES

logger = logging.getLogger(__name__)


def create_candidate(db, snap: dict, alert_id=None, scenario=None) -> None:
    """Capture one novel (UNKNOWN) failure from a snapshot dict.

    Pulls the classifier + localization blocks straight from the snapshot. Dedup
    via the (data_timestamp, scenario) unique constraint + ON CONFLICT DO NOTHING,
    mirroring inference_log — the replay loop replays the same data-time on every
    pass, so the first capture wins and the repeats are silently dropped.

    ``scenario`` is the replay scenario active at fire time ("F3"/"F4"), passed by
    decision_service. It is the ground-truth label and the second half of the dedup
    key — Postgres treats NULLs as distinct, so a real value (not the snapshot,
    which doesn't carry one) is what makes the dedup actually fire.
    """
    clf = snap.get("classifier", {})
    loc = snap.get("localization", {})

    data_ts = None
    try:
        data_ts = datetime.fromisoformat(snap["timestamp"])
    except (KeyError, ValueError, TypeError):
        data_ts = None

    top3 = [
        {"sensor": p.get("sensor"), "error": round(float(p.get("error", 0.0)), 4)}
        for p in loc.get("top3", [])
    ] or None

    stmt = (
        pg_insert(NovelFailureCandidate)
        .values(
            id=uuid.uuid4(),
            alert_id=alert_id,
            equipment_id=APU_01_ID,
            data_timestamp=data_ts,
            scenario=scenario,
            anomaly_score=snap.get("anomaly", {}).get("score"),
            classifier_probability=clf.get("anomaly_probability"),
            classifier_verdict=clf.get("verdict"),
            fault_type=loc.get("fault_type"),
            top_sensors=top3,
            recommended_action=loc.get("action"),
            status="new",
        )
        .on_conflict_do_nothing(constraint="uq_novel_failure_ts_scenario")
    )
    db.execute(stmt)
    db.commit()


def list_candidates(db, status=None, limit: int = 100):
    q = db.query(NovelFailureCandidate)
    if status:
        q = q.filter(NovelFailureCandidate.status == status)
    return (
        q.order_by(NovelFailureCandidate.detected_at.desc())
        .limit(limit)
        .all()
    )


def get_latest_candidate(db, scenario=None):
    q = db.query(NovelFailureCandidate)
    if scenario:
        q = q.filter(NovelFailureCandidate.scenario == scenario)
    return q.order_by(NovelFailureCandidate.detected_at.desc()).first()


def update_status(db, candidate_id, status: str):
    if status not in NOVEL_STATUSES:
        raise ValueError(f"invalid status '{status}'")
    row = (
        db.query(NovelFailureCandidate)
        .filter(NovelFailureCandidate.id == candidate_id)
        .first()
    )
    if row is None:
        return None
    row.status = status
    db.commit()
    db.refresh(row)
    return row
