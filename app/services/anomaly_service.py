"""Anomaly-detection service — real model inference (Phase 2).

Loads all four model branches once at startup into a rolling ``InferenceEngine``
and serves the dashboard snapshot defined in ``app/ml/SNAPSHOT_CONTRACT.md``.

Rows are fed from a cached replay slice of the held-out test set (around the
novel F4 failure); each call advances one tick. This per-call advance is an
interim stand-in for the Phase 4 replay engine (speed control / background
streaming) — it is enough for ``GET /dashboard`` to return a real snapshot.
"""
import logging
from threading import Lock

from app.ml.constants import FEATURE_COLS, DATASET_CSV
from app.ml.preprocessing import (load_raw_csv, add_failure_label,
                                  clean_resample_segment)
from app.ml.inference import InferenceEngine
from app.services.decision_service import handle_snapshot

logger = logging.getLogger(__name__)

# demo replay window: held-out test set, spanning the ramp into the novel F4 failure
_REPLAY_START = "2020-07-15 09:00"
_REPLAY_END = "2020-07-15 19:00"
_WARMUP = 360  # fill the buffer (classifier window) before serving

_engine = None
_rows = None
_cursor = 0
_lock = Lock()


def load_model() -> None:
    """Load every model once and warm the engine. Called at app startup."""
    global _engine, _rows, _cursor
    if _engine is not None:
        return
    df = clean_resample_segment(add_failure_label(load_raw_csv(DATASET_CSV)))
    sl = df[(df.index >= _REPLAY_START) & (df.index <= _REPLAY_END)]
    _rows = list(zip([str(t) for t in sl.index],
                     sl[FEATURE_COLS].to_numpy(dtype="float32")))
    engine = InferenceEngine()
    for ts, row in _rows[:_WARMUP]:
        engine.push(row, ts=ts)  # warm buffer + score/sensor history
    _engine = engine
    _cursor = _WARMUP % len(_rows)


def predict_anomaly() -> dict:
    """Advance the replay one tick and return the current dashboard snapshot."""
    global _cursor
    if _engine is None:
        load_model()
    with _lock:
        ts, row = _rows[_cursor]
        _cursor = (_cursor + 1) % len(_rows)
        snap = _engine.push(row, ts=ts)
    # Persist an alert+notification on a latched episode. Done outside the lock
    # and fault-tolerant: a DB hiccup must not break the dashboard poll.
    try:
        handle_snapshot(snap)
    except Exception:
        logger.exception("decision/persistence step failed")
    return snap
