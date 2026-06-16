"""Mock anomaly-detection service.

Generates synthetic sensor readings and a random anomaly score, then
classifies against the configured threshold.  Used as a stand-in until
a real ML model is integrated.
"""

import random
from datetime import datetime

from app.core.config import MODEL_VERSION, THRESHOLD
from app.schemas.anomaly_schema import AnomalyStatus


def detect_anomaly() -> dict:
    """Generate synthetic sensor data and return an anomaly classification.

    Returns:
        A dictionary whose keys match the ``AnomalyDetectionResponse`` schema.
    """
    # Synthetic sensor readings
    oil_temperature: float = round(random.uniform(60.0, 100.0), 2)
    comp: int = random.choice([0, 1])
    dv_electric: int = random.choice([0, 1])
    towers: int = random.choice([0, 1])
    mpg: float = round(random.uniform(5.0, 20.0), 2)
    lps: float = round(random.uniform(0.0, 1.0), 4)
    pressure_switch: int = random.choice([0, 1])
    oil_level: float = round(random.uniform(1.0, 5.0), 2)
    caudal_impulse: float = round(random.uniform(0.0, 2.0), 4)

    # Anomaly scoring
    anomaly_score: float = round(random.uniform(0, 1), 4)
    status: AnomalyStatus = (
        AnomalyStatus.ANOMALY if anomaly_score >= THRESHOLD else AnomalyStatus.NORMAL
    )

    return {
        "oil_temperature": oil_temperature,
        "comp": comp,
        "dv_electric": dv_electric,
        "towers": towers,
        "mpg": mpg,
        "lps": lps,
        "pressure_switch": pressure_switch,
        "oil_level": oil_level,
        "caudal_impulse": caudal_impulse,
        "anomaly_score": anomaly_score,
        "status": status,
        "threshold": THRESHOLD,
        "model_version": MODEL_VERSION,
        "timestamp": datetime.utcnow().isoformat(),
    }
