"""Track A — PIPELINE DEMO (explicitly NOT a detection).

Proves the live ESP32 stream flows through EVERY stage of the REAL pipeline the
models were trained with — not just preprocessing, but windowing, scaling,
feature engineering, and the model forward pass for all four branches:

  1. clean_resample_segment   — 1 Hz -> 10 s grid, gap fill, segment ids
  2. RawBuffer + cold-start    — rolling window store (same class as live inference)
  3. StandardScaler.transform  — IF scaler, same fitted object as training
  4. if_window_features        — 6 stats x 15 channels = 90-feature vector
  5. IsolationForest.decision_function   — anomaly model forward pass
  6. LSTM Autoencoder.predict            — (1,60,15) reconstruction
  7. LightGBM RUL  (rul_features_window -> 143 feats -> predict)
  8. XGBoost Classifier (classifier_window_features -> 43 feats -> predict_proba)

COLD-START (the reason this runs without a 10-minute warm-up):
  The IF/LSTM window is 60 rows (10 min), RUL 180 (30 min), classifier 360
  (60 min). Rather than wait, the model windows are pre-filled with the
  training-normal baseline prior — the SAME baseline already used for the 13
  non-live channels in every padded row. Live hardware rows then progressively
  replace the prior from the most-recent end. So every stage runs from the
  first live sample; the `live_rows`/`prior_rows` split is reported per window
  so it is never presented as more live data than there really is.

HARD GUARDRAIL: nothing here drives a presented detection or alert.
  - Every model output is labelled "PIPELINE DEMO ONLY".
  - Live values are raw kPa, NOT rescaled to training bar units — so the scores
    are meaningless by construction. This demonstrates pipeline mechanics only.

REUSE: clean_resample_segment, RawBuffer, if_window_features, rul_features_window,
classifier_window_features, get_registry — the exact objects/functions the live
inference engine uses.
"""
import pandas as pd

from app.ml.buffer import RawBuffer
from app.ml.classifier import classifier_feature_names, classifier_window_features
from app.ml.constants import FEATURE_COLS
from app.ml.features import if_window_features
from app.ml.inference import WINDOW_CLF, WINDOW_IF, WINDOW_RUL
from app.ml.preprocessing import add_failure_label, clean_resample_segment
from app.ml.registry import get_registry
from app.ml.rul import rul_features_window
from app.services import hardware_ingest

LABEL = "pipeline check — not a detection"

_NOTE = (
    "TP2 & Reservoirs are live (raw kPa, UNSCALED); the other 13 channels "
    "(including the broken TP3) are training-normal baseline constants. Model "
    "windows are cold-started with the same baseline prior, then progressively "
    "replaced by live rows. Values are NOT rescaled — this is a pipeline check only."
)
_UNIT_NOTE = "PIPELINE DEMO ONLY — value not meaningful (live kPa vs training bar)"


def _mix(grid_rows: int, window: int) -> dict:
    """How many rows of this window are live vs cold-start prior."""
    live = min(grid_rows, window)
    return {"window": window, "live_rows": live, "prior_rows": window - live}


def run_pipeline_demo() -> dict:
    ts_list, rows = hardware_ingest.buffer.padded_rows()
    raw_n = len(rows)

    if not rows:
        return {
            "available": False, "label": LABEL,
            "pipeline_status": "NO_DATA",
            "reason": "no hardware samples buffered yet",
            "raw_hz_samples": 0, "grid_10s_rows": 0,
            "feature_vector": {}, "stages": {},
        }

    # ── Stage 1: preprocessing (REUSED — exact same function as live inference) ──
    df = pd.DataFrame(rows, columns=FEATURE_COLS,
                      index=pd.to_datetime(ts_list, utc=True).tz_localize(None))
    df = df[~df.index.duplicated(keep="first")].sort_index()
    df_final = clean_resample_segment(add_failure_label(df))
    grid_rows = len(df_final)

    stages = {
        "1_preprocessing": {
            "name": "clean_resample_segment",
            "reused_from": "app/ml/preprocessing.py (same function as live inference)",
            "input":  {"rows": raw_n, "channels": 15, "freq": "1 Hz"},
            "output": {"rows": grid_rows, "channels": 15, "freq": "10 s"},
            "input_shape": [raw_n, 15],
            "output_shape": [grid_rows, 15],
            "status": "OK",
        }
    }

    if grid_rows == 0:
        return {
            "available": True, "label": LABEL,
            "pipeline_status": "INSUFFICIENT_DATA",
            "raw_hz_samples": raw_n, "grid_10s_rows": 0,
            "feature_vector": {}, "stages": stages,
        }

    latest = df_final[FEATURE_COLS].iloc[-1]

    # ── Stage 2: RawBuffer + cold-start padding ──────────────────────────────
    # Pre-fill with the baseline prior so the largest window (classifier, 360)
    # is full; live rows are pushed last so they sit at the most-recent end.
    base_row = hardware_ingest.buffer.base_row()
    cold_start = max(0, WINDOW_CLF - grid_rows)
    temp_buf = RawBuffer(capacity=max(WINDOW_CLF, grid_rows))
    for _ in range(cold_start):
        temp_buf.push(base_row)
    for row_arr in df_final[FEATURE_COLS].to_numpy():
        temp_buf.push(row_arr)

    stages["2_raw_buffer"] = {
        "name": "RawBuffer.push + cold-start prior",
        "reused_from": "app/ml/buffer.py (same class as live inference)",
        "live_rows": grid_rows,
        "prior_rows": cold_start,
        "windows": {
            "IF / LSTM": _mix(grid_rows, WINDOW_IF),
            "RUL":       _mix(grid_rows, WINDOW_RUL),
            "Classifier": _mix(grid_rows, WINDOW_CLF),
        },
        "note": f"{grid_rows} live + {cold_start} prior rows — windows full, every model runs",
        "status": "OK",
    }

    reg = get_registry()

    # ── Stages 3–5: Isolation Forest branch ──────────────────────────────────
    w60 = temp_buf.window(WINDOW_IF)
    w60_scaled = reg.if_scaler.transform(pd.DataFrame(w60, columns=FEATURE_COLS))
    stages["3_if_scaling"] = {
        "name": "StandardScaler.transform (IF)",
        "reused_from": "registry.if_scaler (same fitted object as training)",
        "input_shape": [WINDOW_IF, 15], "output_shape": list(w60_scaled.shape),
        "note": "kPa inputs vs bar-fit scaler -> out-of-distribution z-scores (expected)",
        "status": "OK",
    }

    feat90 = if_window_features(w60_scaled).reshape(1, -1)
    stages["4_if_features"] = {
        "name": "if_window_features -> 90 stats",
        "reused_from": "app/ml/features.py (same function as live inference)",
        "stats": ["mean", "std", "min", "max", "rms", "slope"],
        "input_shape": list(w60_scaled.shape), "output_shape": list(feat90.shape),
        "status": "OK",
    }

    raw_if = float(-reg.iso.decision_function(feat90)[0])
    stages["5_if_model"] = {
        "name": "IsolationForest.decision_function",
        "reused_from": "registry.iso (same fitted model as training)",
        "input_shape": list(feat90.shape),
        "raw_score": round(raw_if, 6),
        "note": _UNIT_NOTE, "status": "OK",
    }

    # ── Stage 6: LSTM Autoencoder ────────────────────────────────────────────
    X_lstm = w60_scaled.reshape(1, WINDOW_IF, len(FEATURE_COLS)).astype("float32")
    try:
        pred = reg.lstm.predict(X_lstm, verbose=0)
        stages["6_lstm_model"] = {
            "name": "LSTM Autoencoder.predict",
            "reused_from": "registry.lstm (same fitted model as training)",
            "input_shape": list(X_lstm.shape), "output_shape": list(pred.shape),
            "note": _UNIT_NOTE, "status": "OK",
        }
    except Exception as exc:
        stages["6_lstm_model"] = {"name": "LSTM Autoencoder.predict",
                                  "status": f"ERROR: {exc}"}

    # ── Stage 7: LightGBM RUL ────────────────────────────────────────────────
    try:
        w_rul = temp_buf.window(WINDOW_RUL)
        feat143 = rul_features_window(w_rul).reshape(1, -1)
        hours = float(reg.rul_model.predict(reg.rul_scaler.transform(feat143))[0])
        stages["7_rul_model"] = {
            "name": "LightGBM RUL (rul_features_window -> 143 feats -> predict)",
            "reused_from": "app/ml/rul.py + registry.rul_model / rul_scaler",
            "input_shape": list(feat143.shape),
            "raw_score": round(hours, 3),
            "note": f"{_UNIT_NOTE} (predicted hours)", "status": "OK",
        }
    except Exception as exc:
        stages["7_rul_model"] = {"name": "LightGBM RUL", "status": f"ERROR: {exc}"}

    # ── Stage 8: XGBoost Classifier ──────────────────────────────────────────
    try:
        w_clf = pd.DataFrame(temp_buf.window(WINDOW_CLF), columns=FEATURE_COLS)
        feats = classifier_window_features(w_clf)
        clf_cols = classifier_feature_names()
        X_clf = pd.DataFrame([[feats[c] for c in clf_cols]], columns=clf_cols)
        prob = float(reg.clf.predict_proba(reg.clf_scaler.transform(X_clf))[0, 1])
        stages["8_clf_model"] = {
            "name": "XGBoost Classifier (classifier_window_features -> 43 feats -> predict_proba)",
            "reused_from": "app/ml/classifier.py + registry.clf / clf_scaler",
            "input_shape": [1, len(clf_cols)],
            "raw_score": round(prob, 4),
            "note": f"{_UNIT_NOTE} (failure-class probability)", "status": "OK",
        }
    except Exception as exc:
        stages["8_clf_model"] = {"name": "XGBoost Classifier", "status": f"ERROR: {exc}"}

    all_ok = all(str(s.get("status", "")).startswith("OK") for s in stages.values())
    return {
        "available": True, "label": LABEL,
        "pipeline_status": "OK" if all_ok else "PARTIAL",
        "raw_hz_samples": raw_n, "grid_10s_rows": grid_rows,
        "cold_start_rows": cold_start,
        "feature_vector": {c: float(latest[c]) for c in FEATURE_COLS},
        "live_channels": ["TP2", "Reservoirs"],
        "baseline_channels": [c for c in FEATURE_COLS if c not in ("TP2", "Reservoirs")],
        "stages": stages, "note": _NOTE,
    }
