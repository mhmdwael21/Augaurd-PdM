"""Inference engine — turns a stream of raw rows into dashboard snapshots.

Each `push(row)` appends a raw row and returns one snapshot dict matching
SNAPSHOT_CONTRACT.md. Per-branch scaling/order follows the saved metadata:
  - IF / LSTM : scale raw channels (StandardScaler) -> window
  - RUL       : window raw -> engineer 143 -> StandardScaler
  - classifier: window raw -> engineer 43 -> MinMaxScaler
Detection = IF; localization + RUL are gated behind an IF anomaly flag.
"""
from collections import deque

import numpy as np
import pandas as pd

from .constants import FEATURE_COLS, ANALOG_COLS
from .registry import get_registry
from .buffer import RawBuffer
from .features import if_window_features, lstm_per_sensor_error, classify_fault
from .rul import rul_features_window
from .classifier import classifier_window_features, classifier_feature_names

WINDOW_IF = 60
WINDOW_RUL = 180
WINDOW_CLF = 360
HISTORY = 90
CLF_GATE = 0.60
MODEL_VERSION = "1.0.0"

# Display upper anchor for the 0-1 normalized score: the strongest IF anomaly raw
# score observed on the held-out test set (~+0.049). So normalized 1.0 == worst
# anomaly seen. DISPLAY ONLY — detection uses the raw threshold, not this.
IF_DISPLAY_HI = 0.05

# State-machine hysteresis (Phase 3)
LATCH_N = 3           # consecutive flagged windows to latch into ANOMALY
RECOVER_N = 5         # consecutive sub-threshold windows to recover to NORMAL
FAILURE_SCORE = 0.90  # score at/above this while anomalous -> FAILURE
FAILURE_RUL_H = 12    # RUL below this while anomalous -> FAILURE

HEADLINE = [
    ("TP2", "TP2 · Compressor", "bar"),
    ("H1", "H1 · Pressure", "bar"),
    ("Motor_current", "Motor Current", "A"),
    ("Oil_temperature", "Oil Temperature", "°C"),
]
_IDX = {c: i for i, c in enumerate(FEATURE_COLS)}

ACTION_MAP = {
    "Pressure Fault": "Inspect pneumatic circuit for air leaks — valves, seals, piping.",
    "Thermal Fault": "Check oil cooling system and motor load.",
    "Flow Fault": "Inspect flow meters and air intake.",
    "Digital Fault": "Verify switch/sensor wiring and actuator states.",
}


def normalize_if_score(raw, lo, thr, hi):
    """Piecewise-linear raw -> 0-1, anchored so the operational threshold == 0.65."""
    if raw <= thr:
        x = 0.65 * (raw - lo) / (thr - lo) if thr > lo else 0.0
    else:
        x = 0.65 + 0.35 * (raw - thr) / (hi - thr) if hi > thr else 1.0
    return float(min(1.0, max(0.0, x)))


class InferenceEngine:
    def __init__(self, registry=None):
        self.reg = registry or get_registry()
        self.buf = RawBuffer(capacity=WINDOW_CLF + 240)
        self.score_hist = deque(maxlen=HISTORY)
        self.sensor_hist = {k: deque(maxlen=HISTORY) for k, _, _ in HEADLINE}
        self.consec = 0          # consecutive flagged windows
        self.below = 0           # consecutive sub-threshold windows
        self.state = "NORMAL"    # latched state machine
        self.episode_active = False
        m = self.reg.if_meta
        self.if_lo = float(m["train_score_min"])
        self.if_thr = float(self.reg.if_threshold)
        self.if_hi = IF_DISPLAY_HI
        self._clf_cols = classifier_feature_names()

    def push(self, row, ts=None):
        self.buf.push(row)
        arr = np.asarray(row, dtype=np.float32)
        for k, _, _ in HEADLINE:
            self.sensor_hist[k].append(float(arr[_IDX[k]]))
        return self.snapshot(ts)

    def snapshot(self, ts=None):
        w60 = self.buf.window(WINDOW_IF)
        if w60 is None:
            return None  # warming up

        reg = self.reg
        # --- IF detection ---
        w60_scaled = reg.if_scaler.transform(pd.DataFrame(w60, columns=FEATURE_COLS))
        feat90 = if_window_features(w60_scaled).reshape(1, -1)
        raw = float(-reg.iso.decision_function(feat90)[0])
        score = normalize_if_score(raw, self.if_lo, self.if_thr, self.if_hi)
        flagged = raw >= self.if_thr
        self.score_hist.append(score)
        if flagged:
            self.consec += 1
            self.below = 0
        else:
            self.below += 1
            self.consec = 0

        rul_block = self._rul(flagged)
        state, alert_event = self._advance_state(score, rul_block)

        return {
            "timestamp": ts,
            "status": state,
            "anomaly": {
                "score": score, "raw_score": raw, "threshold": 0.65,
                "history": list(self.score_hist),
            },
            "sensors": self._sensors(),
            "classifier": self._classifier(flagged),
            "rul": rul_block,
            "localization": self._localization(w60_scaled, flagged),
            "detection": {
                "consecutive_anomalous_windows": self.consec,
                "alert_recommended": self.consec >= LATCH_N,
                "alert_event": alert_event,
                "episode_active": self.episode_active,
            },
            "meta": {"model_version": MODEL_VERSION, "dataset": "MetroPT-3"},
        }

    def _advance_state(self, score, rul_block):
        """Latching NORMAL/DRIFT/ANOMALY/FAILURE. Returns (state, alert_event).

        alert_event fires once, on the transition that latches a new anomaly
        episode (so one alert per episode; re-arms after recovery to NORMAL).
        """
        alert_event = False
        failure = score >= FAILURE_SCORE or (
            rul_block["available"] and rul_block["hours"] is not None
            and rul_block["hours"] < FAILURE_RUL_H
        )
        if self.state in ("NORMAL", "DRIFT"):
            if self.consec >= LATCH_N:
                self.state = "FAILURE" if failure else "ANOMALY"
                self.episode_active = True
                alert_event = True
            else:
                self.state = "DRIFT" if score >= 0.5 else "NORMAL"
        else:  # ANOMALY or FAILURE
            if self.below >= RECOVER_N:
                self.state = "NORMAL"
                self.episode_active = False
            else:
                self.state = "FAILURE" if failure else "ANOMALY"
        return self.state, alert_event

    # ── branches ──────────────────────────────────────────────────────
    def _classifier(self, flagged):
        w = self.buf.window(WINDOW_CLF)
        if w is None:
            return {"anomaly_probability": None, "verdict": "NORMAL",
                    "confidence": None, "gate": CLF_GATE}
        wdf = pd.DataFrame(w, columns=FEATURE_COLS)
        feats = classifier_window_features(wdf)
        X = pd.DataFrame([[feats[c] for c in self._clf_cols]], columns=self._clf_cols)
        prob = float(self.reg.clf.predict_proba(self.reg.clf_scaler.transform(X))[0, 1])
        if not flagged and prob < 0.5:
            verdict = "NORMAL"
        elif prob >= CLF_GATE:
            verdict = "KNOWN"
        else:
            verdict = "UNKNOWN"
        return {"anomaly_probability": prob, "verdict": verdict,
                "confidence": prob, "gate": CLF_GATE}

    def _rul(self, flagged):
        off = {"available": False, "hours": None, "zone": "NOMINAL",
               "cap": 168, "degradation_threshold": 72}
        w = self.buf.window(WINDOW_RUL)
        if not flagged or w is None:
            return off
        feat = rul_features_window(w).reshape(1, -1)
        hours = float(np.clip(self.reg.rul_model.predict(self.reg.rul_scaler.transform(feat))[0], 0, 72))
        zone = "CRITICAL" if hours < 12 else "DEGRADATION" if hours <= 48 else "NOMINAL"
        return {"available": True, "hours": hours, "zone": zone,
                "cap": 168, "degradation_threshold": 72}

    def _localization(self, w60_scaled, flagged):
        if not flagged:
            return {"available": False, "fault_type": None, "action": None,
                    "per_sensor": [], "top3": []}
        X = w60_scaled.reshape(1, WINDOW_IF, len(FEATURE_COLS)).astype("float32")
        pred = self.reg.lstm.predict(X, verbose=0)
        err = lstm_per_sensor_error(X, pred, FEATURE_COLS, ANALOG_COLS)[0]
        order = np.argsort(err)[::-1]
        per_sensor = [{"sensor": FEATURE_COLS[i], "error": float(err[i]), "rank": r + 1}
                      for r, i in enumerate(order)]
        fault = classify_fault([FEATURE_COLS[i] for i in order[:3]])
        return {
            "available": True, "fault_type": fault, "action": ACTION_MAP.get(fault),
            "per_sensor": per_sensor,
            "top3": [{"sensor": p["sensor"], "error": p["error"]} for p in per_sensor[:3]],
        }

    def _sensors(self):
        cur = self.buf.rows[-1]
        values = {c: float(cur[_IDX[c]]) for c in FEATURE_COLS}
        headline = []
        for k, label, unit in HEADLINE:
            hist = list(self.sensor_hist[k])
            headline.append({
                "key": k, "label": label, "unit": unit,
                "value": float(cur[_IDX[k]]), "history": hist,
                "min": min(hist) if hist else 0.0, "max": max(hist) if hist else 1.0,
            })
        return {"values": values, "headline": headline}
