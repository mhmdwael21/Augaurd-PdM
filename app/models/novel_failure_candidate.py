"""NovelFailureCandidate ORM model — the "Novel Failure Capture" feedback loop.

When the Isolation Forest flags an anomaly but the supervised classifier abstains
(verdict == "UNKNOWN"), that is not a dead end — it is a failure pattern the
system has never seen. We capture each one, labelled with the LSTM localizer's
diagnosis, so it can become future training data.

Additive / read-mostly. Written only by decision_service.handle_snapshot (the one
place ML output becomes DB rows), behind a try/except so it can never break the
existing alert/notification flow. The engine stays DB-free.

Dedup mirrors inference_log: a unique constraint on (data_timestamp, scenario) +
ON CONFLICT DO NOTHING. The replay loop re-runs the same data-time on every pass,
so the constraint keeps the first capture per (data-time, scenario) and silently
drops the repeats — without it every loop would re-insert the same episode.
"""

import uuid

from sqlalchemy import Column, DateTime, Float, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.sql import func

from app.core.database import Base


class NovelFailureCandidate(Base):
    __tablename__ = "novel_failure_candidates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Loose link to the alert that fired (no DB-level FK, matching inference_log).
    alert_id       = Column(UUID(as_uuid=True), nullable=True)
    # Asset this candidate belongs to (always APU-01 today).
    equipment_id   = Column(UUID(as_uuid=True), nullable=True)
    detected_at    = Column(DateTime, nullable=False, server_default=func.now())
    data_timestamp = Column(DateTime, nullable=True, index=True)
    scenario       = Column(String(10), nullable=True)

    anomaly_score          = Column(Float, nullable=True)
    classifier_probability = Column(Float, nullable=True)
    classifier_verdict     = Column(String(20), nullable=True)  # always "UNKNOWN"

    fault_type         = Column(String(60), nullable=True)
    top_sensors        = Column(JSON, nullable=True)   # localizer top-3 diagnosis
    recommended_action = Column(String(255), nullable=True)

    # new | under_review | confirmed | dismissed
    status = Column(String(20), nullable=False, default="new")

    __table_args__ = (
        UniqueConstraint("data_timestamp", "scenario",
                         name="uq_novel_failure_ts_scenario"),
    )
