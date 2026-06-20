"""Replay engine (Phase 4).

A background thread streams real test rows at an adjustable speed through the
InferenceEngine + decision layer, caching the latest snapshot. Request handlers
read the cached snapshot and drive controls. A separate batch path scores an
uploaded CSV.

Concurrency model (single lock, never held during slow work):
  - Shared state (playing/speed/scenario/cursor/engine/generation/latest) is
    guarded by ``_lock``; only fast field reads/swaps happen under it.
  - The loop captures (engine, generation, row) under the lock, runs the slow
    ``engine.push`` OUTSIDE the lock, then publishes the snapshot under the lock
    ONLY IF ``generation`` is unchanged — so a scenario jump mid-push discards
    the stale result instead of corrupting state.
  - Scenario/reset rebuilds + warms a NEW engine outside the lock, then swaps it
    in under the lock (fast) and bumps ``generation``.
  - ``GET`` reads are fast copies under the lock — never blocked by inference.
  - CSV upload uses its own engine instance (zero shared state).
  - DB writes happen only in the loop thread, each with its own session.
  - Every tick is wrapped in try/except: a bad tick is logged + backed off, the
    thread never dies.
"""
import copy
import io
import logging
import threading
from datetime import datetime

import pandas as pd

from app.ml.constants import FEATURE_COLS, DATASET_CSV
from app.ml.preprocessing import (load_raw_csv, add_failure_label,
                                  clean_resample_segment)
from app.ml.inference import InferenceEngine
from app.services.decision_service import handle_snapshot
from app.services.inference_log_service import write_snapshot

logger = logging.getLogger(__name__)


class ReplayController:
    BASE_INTERVAL = 0.10   # seconds per tick at 1x
    IDLE_INTERVAL = 0.20   # poll interval while paused
    ERROR_BACKOFF = 0.50   # pause after a failed tick
    WARMUP = 360           # rows to fill the classifier window before serving
    # inference_log sampling, measured in DATA time (speed-independent). During
    # an episode we sample finely so the per-alert chart has a real curve;
    # outside it a coarse baseline keeps the overall trend without flooding.
    EPISODE_STRIDE_S  = 20     # data-seconds between samples while status != NORMAL
    BASELINE_STRIDE_S = 120    # data-seconds between samples while NORMAL
    SCENARIOS = {
        "F4": ("2020-07-15 11:00", "2020-07-15 17:00"),  # novel failure
        "F3": ("2020-06-05 05:00", "2020-06-05 13:00"),  # known failure
    }

    def __init__(self):
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None
        self._playing = True
        self._speed = 1.0
        self._scenario = "F4"
        self._cursor = 0
        self._engine = None
        self._generation = 0
        self._latest = None
        self._rows = {}          # scenario -> list[(ts, row)]  (immutable after load)
        self._warm = {}          # scenario -> pre-warmed template engine (immutable)
        self._loaded = False
        self._last_log_data_ts = None  # data-timestamp of last inference_log write
        self._last_log_status  = None  # status at last write (track transitions)

    # ── lifecycle ────────────────────────────────────────────────────
    def load(self):
        if self._loaded:
            return
        df = clean_resample_segment(add_failure_label(load_raw_csv(DATASET_CSV)))
        for name, (a, b) in self.SCENARIOS.items():
            sl = df[(df.index >= a) & (df.index <= b)]
            self._rows[name] = list(zip([str(t) for t in sl.index],
                                        sl[FEATURE_COLS].to_numpy(dtype="float32")))
        # Pre-warm one template engine per scenario (~10 s each, paid once at
        # startup). Reset / scenario switch then CLONES a template in well under
        # a millisecond — so the controls respond instantly at runtime.
        for name in self.SCENARIOS:
            self._warm[name] = self._build_engine(name)
        self._engine = self._clone_engine(self._warm[self._scenario])
        self._cursor = self.WARMUP % len(self._rows[self._scenario])
        self._loaded = True

    def _build_engine(self, scenario):
        """Fresh engine warmed over the scenario's first WARMUP rows (no DB writes)."""
        eng = InferenceEngine()
        for ts, row in self._rows[scenario][:self.WARMUP]:
            eng.push(row, ts=ts)
        return eng

    @staticmethod
    def _clone_engine(template):
        """A fresh engine identical to a freshly-warmed one — in well under 1 ms.

        Deep-copies the template's warmed state (buffers, history, state machine)
        but SHARES the heavy, read-only model registry: it is detached during the
        copy so ``deepcopy`` doesn't walk the models, then re-attached to both.
        """
        reg = template.reg
        template.reg = None
        try:
            clone = copy.deepcopy(template)
        finally:
            template.reg = reg
        clone.reg = reg
        return clone

    def start(self):
        self.load()
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="replay", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)

    # ── background loop ──────────────────────────────────────────────
    def _loop(self):
        while not self._stop.is_set():
            try:
                with self._lock:
                    playing, speed = self._playing, self._speed
                    gen, eng = self._generation, self._engine
                    scenario = self._scenario
                    if playing:
                        rows = self._rows[self._scenario]
                        ts, row = rows[self._cursor]
                        self._cursor = (self._cursor + 1) % len(rows)
                    else:
                        ts = row = None
                if not playing:
                    self._stop.wait(self.IDLE_INTERVAL)
                    continue

                snap = eng.push(row, ts=ts)          # slow — outside the lock

                with self._lock:
                    publish = gen == self._generation  # discard if scenario jumped
                    if publish:
                        self._latest = snap
                if publish:
                    alert = handle_snapshot(snap, scenario)   # DB — outside the lock
                    self._maybe_log(snap, scenario, alert)

                self._stop.wait(max(0.01, self.BASE_INTERVAL / speed))
            except Exception:
                logger.exception("replay tick failed")
                self._stop.wait(self.ERROR_BACKOFF)

    def _maybe_log(self, snap, scenario, alert):
        """Persist a snapshot to inference_log on a DATA-time cadence.

        Always logs an alert-firing tick (so every alert has a findable anchor)
        and every status transition. Otherwise samples on a data-time stride —
        fine inside an episode (dense curve for the per-alert chart), coarse
        while NORMAL. Data-time keeps cadence identical at any replay speed.
        """
        snap_status = snap.get("status")
        try:
            data_ts = datetime.fromisoformat(snap["timestamp"])
        except (KeyError, ValueError, TypeError):
            data_ts = None

        episode = snap_status not in (None, "NORMAL", "WARMING")
        stride  = self.EPISODE_STRIDE_S if episode else self.BASELINE_STRIDE_S

        due = True
        if data_ts is not None and self._last_log_data_ts is not None:
            delta = (data_ts - self._last_log_data_ts).total_seconds()
            # >= stride advances the curve; a large jump means a loop wrap or
            # scenario switch — always anchor the new pass.
            due = delta >= stride or abs(delta) > 3600

        if (alert is not None
                or snap_status != self._last_log_status
                or due):
            write_snapshot(snap, scenario=scenario,
                           alert_id=getattr(alert, "id", None))
            self._last_log_data_ts = data_ts
            self._last_log_status  = snap_status

    # ── controls ─────────────────────────────────────────────────────
    def control(self, playing=None, speed=None, scenario=None, reset=False):
        with self._lock:
            want = scenario if scenario in self.SCENARIOS else self._scenario
            rebuild = reset or (want != self._scenario)

            if playing is not None:
                self._playing = bool(playing)
            if speed is not None:
                self._speed = max(0.1, min(16.0, float(speed)))

            # Reset / scenario switch: swap in a CLONE of the pre-warmed template.
            # Cloning is sub-millisecond, so this whole call returns instantly and
            # the new scenario is live on the very next tick.
            if rebuild:
                self._engine = self._clone_engine(self._warm[want])
                self._scenario = want
                self._cursor = self.WARMUP % len(self._rows[want])
                self._latest = None
                self._generation += 1   # discard any tick still in flight

            return self._state_locked()

    def get(self):
        with self._lock:
            snap = self._latest
            state = self._state_locked()
        if snap is None:
            return {"status": "WARMING", "replay": state}
        return {**snap, "replay": state}

    def _state_locked(self):
        return {
            "playing": self._playing,
            "speed": self._speed,
            "scenario": self._scenario,
            "cursor": self._cursor,
            "scenario_len": len(self._rows.get(self._scenario, [])),
        }


# ── module singleton + helpers ───────────────────────────────────────
_controller = ReplayController()


def start():
    _controller.start()


def stop():
    _controller.stop()


def get_snapshot():
    return _controller.get()


def control(**kwargs):
    return _controller.control(**kwargs)


# ── CSV batch scoring (isolated engine, no shared state, no DB writes) ─
def run_csv(content: bytes) -> dict:
    """Score an uploaded CSV slice through the same pipeline; return summary + series."""
    df = pd.read_csv(io.BytesIO(content), parse_dates=["timestamp"],
                     index_col="timestamp", thousands=",", decimal=".")
    if "Unnamed: 0" in df.columns:
        df = df.drop(columns=["Unnamed: 0"])
    missing = [c for c in FEATURE_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"CSV missing required sensor columns: {missing}")
    df = df.sort_index()
    df = df[~df.index.duplicated(keep="first")]

    df_final = clean_resample_segment(add_failure_label(df))
    eng = InferenceEngine()
    series, peak, anomaly_windows, alert_episodes, faults = [], 0.0, 0, 0, {}
    for ts, row in zip([str(t) for t in df_final.index],
                       df_final[FEATURE_COLS].to_numpy(dtype="float32")):
        s = eng.push(row, ts=ts)
        if s is None:
            continue
        peak = max(peak, s["anomaly"]["score"])
        if s["status"] == "ANOMALY":
            anomaly_windows += 1
        if s["detection"]["alert_event"]:
            alert_episodes += 1
        ft = s["localization"]["fault_type"]
        if ft:
            faults[ft] = faults.get(ft, 0) + 1
        series.append({"timestamp": s["timestamp"],
                       "score": s["anomaly"]["score"], "status": s["status"]})

    step = max(1, len(series) // 120)
    return {
        "rows_in": int(len(df)),
        "rows_processed": int(len(df_final)),
        "snapshots": len(series),
        "peak_score": round(peak, 3),
        "anomaly_windows": anomaly_windows,
        "alert_episodes": alert_episodes,
        "fault_types": faults,
        "series": series[::step],
    }
