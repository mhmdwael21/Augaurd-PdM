"""Hardware ingestion — the 1 Hz rolling buffer both tracks read.

Responsibilities (and ONLY these — detection logic lives in the track modules):
  * accept a validated ESP32 sample (schema already range-checked it),
  * keep ~120 s of raw 1 Hz samples for live display + the Track B trigger,
  * build the 15-channel "padded row" Track A feeds into the EXISTING pipeline:
        TP2        <- after_pump   (live, kPa, UNSCALED)
        Reservoirs <- tank         (live, kPa, UNSCALED)
        every other channel (incl. broken TP3) <- training-normal baseline median
  * track link liveness for the Disconnected fallback.

Guardrail: values are stored/served raw. We never rescale live kPa to look like
training-distribution bar — that is exactly why Track A is a pipeline check, not
a detection.
"""
import json
import threading
import time
from collections import deque
from datetime import datetime, timezone

import numpy as np

from app.core import config
from app.ml.constants import FEATURE_COLS, MODELS_DIR

# channel <- payload-key mapping for the two LIVE sensors
LIVE_MAP = {"TP2": "after_pump", "Reservoirs": "tank"}
# received but intentionally discarded (broken middle gauge / P-Sensor 2)
BROKEN_CHANNEL = "TP3"
BROKEN_KEY = "after_filter"

_IDX = {c: i for i, c in enumerate(FEATURE_COLS)}
_BASELINE_PATH = MODELS_DIR / "baseline_medians.json"


def _load_baseline() -> dict:
    if _BASELINE_PATH.exists():
        return json.loads(_BASELINE_PATH.read_text())
    # Safe fallback so the API still boots; run scripts/compute_baseline.py.
    return {c: 0.0 for c in FEATURE_COLS}


class HardwareBuffer:
    def __init__(self):
        self._lock = threading.Lock()
        self._samples = deque(maxlen=config.HARDWARE_BUFFER_SECONDS)
        self._last_seen = None          # monotonic-ish epoch seconds
        self._baseline = _load_baseline()
        self._base_row = np.array([self._baseline.get(c, 0.0) for c in FEATURE_COLS],
                                  dtype=np.float32)

    # ── write (called from the ingest route, device-key auth) ────────
    def add(self, payload) -> dict:
        """Store one validated sample. Returns a small ingest ack/status dict."""
        now = time.time()
        ts = datetime.now(timezone.utc).isoformat()
        # padded 15-channel row: baseline everywhere, then overwrite live channels
        row = self._base_row.copy()
        row[_IDX["TP2"]] = float(payload.after_pump)
        row[_IDX["Reservoirs"]] = float(payload.tank)
        sample = {
            "t": now,
            "ts": ts,
            "after_pump": float(payload.after_pump),
            "tank": float(payload.tank),
            "after_filter": float(payload.after_filter),  # stored, never displayed
            "raw_ap": int(payload.raw_ap),
            "raw_af": int(payload.raw_af),
            "raw_tk": int(payload.raw_tk),
            "row": row,
        }
        with self._lock:
            self._samples.append(sample)
            self._last_seen = now
            n = len(self._samples)
        return {"buffered": n, "connected": True, "ts": ts}

    # ── read (Track A, Track B, status all pull from here) ───────────
    def connected(self) -> bool:
        with self._lock:
            last = self._last_seen
        if last is None:
            return False
        return (time.time() - last) <= config.HARDWARE_DISCONNECT_TIMEOUT_S

    def base_row(self):
        """A copy of the training-normal baseline padded row (cold-start prior).

        Track A uses this to fill the model windows before enough live rows have
        accumulated — the same baseline already used for the 13 non-live channels.
        """
        return self._base_row.copy()

    def latest(self) -> dict | None:
        with self._lock:
            return dict(self._samples[-1]) if self._samples else None

    def live_series(self, seconds: float):
        """[(t, tp2_kpa, reservoirs_kpa)] within the last `seconds` — for the trigger."""
        cutoff = time.time() - seconds
        with self._lock:
            return [(s["t"], s["after_pump"], s["tank"])
                    for s in self._samples if s["t"] >= cutoff]

    def display_series(self, n: int = 90):
        """Recent live points for the gauges/sparklines (raw kPa)."""
        with self._lock:
            items = list(self._samples)[-n:]
        return [{"ts": s["ts"], "after_pump": s["after_pump"], "tank": s["tank"]}
                for s in items]

    def padded_rows(self):
        """All buffered padded rows + ISO timestamps — Track A's pipeline input."""
        with self._lock:
            return ([s["ts"] for s in self._samples],
                    [s["row"] for s in self._samples])

    def stats(self) -> dict:
        with self._lock:
            n = len(self._samples)
            last = self._last_seen
        return {"buffered": n, "last_seen_epoch": last}


# module singleton
buffer = HardwareBuffer()
