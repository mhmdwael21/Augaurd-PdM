"""Feature builders ported verbatim from the notebooks.

`build_if_features` reproduces the Isolation Forest window-statistics builder
(Fault_Localization_PdM_Anomaly.ipynb cell 15): window 60, stride 10,
6 stats x 15 channels = 90 features, concatenated as
[mean, std, min, max, rms, slope], each block in feature_cols order.

Input must be ALREADY scaled (StandardScaler on raw channels) and carry a
`segment_id` column so windows never cross gaps.
"""
import numpy as np
import pandas as pd


def rms(x, axis=0):
    return np.sqrt(np.mean(np.square(x), axis=axis))


def window_slopes(w):
    """Per-channel linear-fit slope over the window (np.polyfit deg 1)."""
    T = w.shape[0]
    t = np.arange(T, dtype=np.float32)
    slopes = np.empty(w.shape[1], dtype=np.float32)
    for j in range(w.shape[1]):
        slopes[j] = np.polyfit(t, w[:, j].astype(np.float32), 1)[0]
    return slopes


def if_window_features(w):
    """90 stats for ONE (window_size x n_channels) scaled array.

    Shared by the batch builder and single-window inference so they are
    identical by construction. Layout: [mean, std(ddof0), min, max, rms, slope].
    """
    return np.concatenate([
        w.mean(axis=0), w.std(axis=0, ddof=0), w.min(axis=0),
        w.max(axis=0), rms(w, axis=0), window_slopes(w),
    ])


def build_if_features(df_scaled, feature_cols, window_size=60, step=10, min_seg_len=None):
    if min_seg_len is None:
        min_seg_len = window_size
    X_list, meta = [], []
    for seg_id, seg in df_scaled.groupby("segment_id"):
        seg = seg.sort_index()
        n = len(seg)
        if n < min_seg_len:
            continue
        arr = seg[feature_cols].to_numpy(dtype=np.float32)
        fail = seg["failure"].to_numpy(dtype=np.int8)
        for start in range(0, n - window_size + 1, step):
            w = arr[start:start + window_size]
            X_list.append(if_window_features(w))
            end_time = seg.index[start + window_size - 1]
            fw = int(fail[start:start + window_size].max() > 0)
            meta.append((end_time, seg_id, fw))
    n_feat = len(feature_cols)
    X = np.vstack(X_list) if X_list else np.empty((0, 6 * n_feat), dtype=np.float32)
    meta = pd.DataFrame(meta, columns=["window_end_time", "segment_id", "failure_window"])
    return X, meta


def build_lstm_windows(df_scaled, feature_cols, window_size=60, step=5, min_seg_len=None):
    """Raw (window x channels) sequences for the LSTM autoencoder.

    Same preprocessing + scaling as the IF branch; only window/stride and the
    output shape differ (Fault_Localization cell 8: window 60, stride 5).
    """
    if min_seg_len is None:
        min_seg_len = window_size
    X_list, meta = [], []
    for seg_id, seg in df_scaled.groupby("segment_id"):
        seg = seg.sort_index()
        n = len(seg)
        if n < min_seg_len:
            continue
        arr = seg[feature_cols].to_numpy(dtype=np.float32)
        fail = seg["failure"].to_numpy(dtype=np.int8)
        for start in range(0, n - window_size + 1, step):
            X_list.append(arr[start:start + window_size])
            end_time = seg.index[start + window_size - 1]
            fw = int(fail[start:start + window_size].max() > 0)
            meta.append((end_time, seg_id, fw))
    if X_list:
        X = np.stack(X_list, axis=0)
    else:
        X = np.empty((0, window_size, len(feature_cols)), dtype=np.float32)
    meta = pd.DataFrame(meta, columns=["window_end_time", "segment_id", "failure_window"])
    return X, meta


def lstm_per_sensor_error(X, X_pred, feature_cols, analog_cols, digital_weight=0.3):
    """Per-window, per-sensor weighted reconstruction error (analog 1.0, digital 0.3).

    Returns (N, n_channels) — the basis for fault localization (top-k culprits).
    """
    w = np.array([1.0 if c in analog_cols else digital_weight for c in feature_cols],
                 dtype=np.float32)
    err = np.square(X - X_pred) * w[None, None, :]
    return err.mean(axis=1)


FAULT_GROUPS = {
    "Pressure Fault": {"TP2", "TP3", "DV_pressure", "Reservoirs"},
    "Thermal Fault": {"Oil_temperature", "Motor_current"},
    "Flow Fault": {"H1", "Caudal_impulses"},
    "Digital Fault": {"COMP", "DV_eletric", "Towers", "MPG",
                      "LPS", "Pressure_switch", "Oil_level"},
}


def classify_fault(top_sensors):
    s = set(top_sensors)
    scores = {k: len(s & v) for k, v in FAULT_GROUPS.items()}
    return max(scores, key=scores.get)
