"""Classifier branch — preprocessing + 43-feature builder.

Ported verbatim from PdM-Classifier.ipynb. This recipe differs from BOTH the
anomaly and RUL branches:
  - snap with .round('10s') (not floor); dedup AFTER rounding (cell 5)
  - resample analog & digital with .mean(); analog interp limit 360 (1h);
    digital ffill().bfill() UNLIMITED; dropna (cell 5)
  - segment by 120s gaps (cell 6); run_id by failure END times (cell 7)
  - window 360 / step 60; per-analog mean/std/min/max/range + per-digital mean
    = 43 features. std is pandas .std() => ddof=1 (cell 12).
"""
import numpy as np
import pandas as pd

from .constants import ANALOG_COLS, DIGITAL_COLS, FAILURES

RUL_CAP_HOURS = 168
DEGRADATION_HOURS = 72


def classifier_feature_names(analog=ANALOG_COLS, digital=DIGITAL_COLS):
    names = []
    for c in analog:
        names += [f"{c}_mean", f"{c}_std", f"{c}_min", f"{c}_max", f"{c}_range"]
    for c in digital:
        names += [f"{c}_mean"]
    return names


def clean_resample_classifier(csv_path, analog=ANALOG_COLS, digital=DIGITAL_COLS,
                              failures=FAILURES):
    df = pd.read_csv(csv_path, thousands=",", decimal=".")
    df = df.drop(columns=[c for c in ["Unnamed: 0"] if c in df.columns])
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.set_index("timestamp").sort_index()

    # snap to 10s grid, dedup AFTER rounding
    df.index = df.index.round("10s")
    df = df[~df.index.duplicated(keep="first")]

    # resample analog/digital separately
    df_a = df[analog].resample("10s").mean()
    df_d = df[digital].resample("10s").mean()
    df_a = df_a.interpolate(method="time", limit=360)   # up to 1h
    df_d = df_d.ffill().bfill()                          # unlimited
    df = pd.concat([df_a, df_d], axis=1).dropna()

    # segment on 120s gaps
    time_diff = df.index.to_series().diff()
    df["segment_id"] = (time_diff > pd.Timedelta(seconds=120)).cumsum().astype(int)

    # run_id by failure END times
    f = [(pd.Timestamp(s), pd.Timestamp(e)) for s, e in failures]
    rb = [f[0][1], f[1][1], f[2][1]]

    def assign_run(ts):
        if ts <= rb[0]:
            return 1
        elif ts <= rb[1]:
            return 2
        elif ts <= rb[2]:
            return 3
        return 4

    df["run_id"] = df.index.map(assign_run)

    # RUL + labels (failure_label uses <= end, inclusive)
    df["rul_hours"] = float(RUL_CAP_HOURS)
    for s, e in f:
        mask = df.index <= e
        ttf = (e - df.index[mask]).total_seconds() / 3600
        df.loc[mask, "rul_hours"] = np.minimum(df.loc[mask, "rul_hours"], ttf)
    df["rul_hours"] = df["rul_hours"].clip(upper=RUL_CAP_HOURS)

    df["failure_label"] = 0
    for i, (s, e) in enumerate(f, 1):
        df.loc[(df.index >= s) & (df.index <= e), "failure_label"] = i

    df["in_degradation_zone"] = (df["rul_hours"] <= DEGRADATION_HOURS).astype(int)
    return df


def classifier_window_features(w, analog=ANALOG_COLS, digital=DIGITAL_COLS):
    """43 features for ONE window DataFrame (rows x channels).

    Shared by the batch builder and single-window inference. Uses pandas .std()
    (ddof=1) to match the notebook. Returns an ordered dict (analog block then
    digital), matching classifier_feature_names().
    """
    feats = {}
    for c in analog:
        v = w[c]
        feats[f"{c}_mean"] = v.mean()
        feats[f"{c}_std"] = v.std()        # pandas -> ddof=1
        feats[f"{c}_min"] = v.min()
        feats[f"{c}_max"] = v.max()
        feats[f"{c}_range"] = v.max() - v.min()
    for c in digital:
        feats[f"{c}_mean"] = w[c].mean()
    return feats


def build_classifier_features(df, analog=ANALOG_COLS, digital=DIGITAL_COLS,
                              window=360, step=60):
    rows = []
    for (run_id, seg_id), g in df.groupby(["run_id", "segment_id"]):
        g = g.sort_index()
        n = len(g)
        if n < window:
            continue
        for s in range(0, n - window + 1, step):
            w = g.iloc[s:s + window]
            last = w.iloc[-1]
            row = {
                "run_id": run_id, "segment_id": seg_id, "window_end_ts": last.name,
                "rul_hours": last["rul_hours"], "failure_label": last["failure_label"],
                "in_degradation": last["in_degradation_zone"],
            }
            row.update(classifier_window_features(w, analog, digital))
            rows.append(row)
    return pd.DataFrame(rows).set_index("window_end_ts")
