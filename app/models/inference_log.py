import uuid

from sqlalchemy import Column, DateTime, Float, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class InferenceLog(Base):
    __tablename__ = "inference_log"

    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp             = Column(DateTime, nullable=False, index=True)
    status                = Column(String(20), nullable=False)
    anomaly_score         = Column(Float, nullable=True)
    rul_hours             = Column(Float, nullable=True)
    rul_zone              = Column(String(20), nullable=True)
    classifier_verdict    = Column(String(20), nullable=True)
    classifier_confidence = Column(Float, nullable=True)
    fault_type            = Column(String(60), nullable=True)
    scenario              = Column(String(10), nullable=False)
    alert_id              = Column(UUID(as_uuid=True), nullable=True)
    # Asset this snapshot belongs to (always APU-01 today). Plain UUID, matching
    # the alert_id convention on this table (no DB-level FK constraint).
    equipment_id          = Column(UUID(as_uuid=True), nullable=True)

    # 7 analog channels
    tp2             = Column(Float, nullable=True)
    tp3             = Column(Float, nullable=True)
    h1              = Column(Float, nullable=True)
    dv_pressure     = Column(Float, nullable=True)
    reservoirs      = Column(Float, nullable=True)
    oil_temperature = Column(Float, nullable=True)
    motor_current   = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("timestamp", "scenario", name="uq_inference_log_ts_scenario"),
    )
