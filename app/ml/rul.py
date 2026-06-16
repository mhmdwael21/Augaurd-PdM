"""RUL branch — preprocessing, run/RUL construction, windowing, and features.

Ported verbatim from PdM-RUL.ipynb. NOTE this pipeline differs from the
anomaly branch:
  - gap handling: analog interp limit_direction="both"; digital ffill/bfill
    WITH limit + keep-mask (cell 7)
  - RUL target: remove failure intervals, slice into runs, hours-to-failure,
    cap 168h (cells 12-13)
  - windowing on RAW (unscaled) channels: seq_len 180, stride 10 (cell 15)
  - seq_to_tabular -> 143 features (cell 16); StandardScaler is applied AFTER.
"""
import numpy as np
import pandas as pd

from .constants import ANALOG_COLS, DIGITAL_COLS, FEATURE_COLS, FAILURES

# 143-feature layout: 9 stat blocks x 15 channels, then trans per digital (8)
STAT_BLOCKS = ["mean", "std", "min", "max", "range", "last", "slope", "dlast", "energy"]


def rul_feature_names(feature_cols=FEATURE_COLS, digital=DIGITAL_COLS):
    names = []
    for st in STAT_BLOCKS:
        names += [f"{c}_{st}" for c in feature_cols]
    names += [f"{c}_trans" for c in digital]
    return names


def rul_failures(failures=FAILURES):
    f = pd.DataFrame({
        "nr": list(range(1, len(failures) + 1)),
        "start": [s for s, _ in failures],
        "end": [e for _, e in failures],
    })
    f["start"] = pd.to_datetime(f["start"]).dt.floor("10s")
    f["end"] = pd.to_datetime(f["end"]).dt.floor("10s")
    return f.sort_values("start").reset_index(drop=True)


def clean_resample_rul(df, expected="10s", small_gap="120s",
                       analog=ANALOG_COLS, digital=DIGITAL_COLS, failures=FAILURES):
    EXPECTED = expected
    SAMPLES = int(pd.Timedelta(small_gap) / pd.Timedelta(EXPECTED))  # 12
    feature_cols = analog + digital

    df = df.sort_index()
    df = df[~df.index.duplicated(keep="first")]

    # (1) snap + aggregate dups (analog mean, digital max)
    df2 = df.copy()
    df2.index = df2.index.floor(EXPECTED)
    agg = {c: "mean" for c in analog}
    agg.update({c: "max" for c in digital})
    df2 = df2[feature_cols].groupby(level=0).agg(agg).sort_index()

    # (2) regular 10s grid
    df_rs = df2.asfreq(EXPECTED)
    missing_any = df_rs[feature_cols].isna().any(axis=1)
    grp = (missing_any != missing_any.shift()).cumsum()
    miss_len = missing_any.groupby(grp).transform("sum")
    small_gap_rows = missing_any & (miss_len <= SAMPLES)

    # (3) fill small gaps
    df_filled = df_rs.copy()
    df_filled[analog] = df_filled[analog].interpolate(
        method="time", limit=SAMPLES, limit_direction="both")
    dig = df_filled[digital].copy()
    dig = dig.ffill(limit=SAMPLES).bfill(limit=SAMPLES)
    keep_dig = (~missing_any) | small_gap_rows
    dig.loc[~keep_dig, :] = np.nan
    for c in digital:
        dig[c] = dig[c].round().clip(0, 1)
    df_filled[digital] = dig

    # (4) segment on big gaps
    big_gap_rows = missing_any & (miss_len > SAMPLES)
    new_segment = big_gap_rows.shift(1, fill_value=True)
    df_filled["segment_id"] = new_segment.cumsum().astype(int)

    # (5) drop big-gap NaNs + rebuild failure labels
    df_final = df_filled.dropna(subset=feature_cols).copy()
    df_final["failure"] = 0
    for s, e in failures:
        s, e = pd.Timestamp(s), pd.Timestamp(e)
        df_final.loc[(df_final.index >= s) & (df_final.index < e), "failure"] = 1
    return df_final


def build_runs_and_rul(df_final, failures_df, cap=168.0):
    """Remove downtime, slice into runs, compute hours-to-failure, cap (cells 12-13)."""
    df2 = df_final.copy()
    keep = pd.Series(True, index=df2.index)
    for _, r in failures_df.iterrows():
        keep &= ~((df2.index >= r["start"]) & (df2.index < r["end"]))
    df2 = df2.loc[keep].copy()

    df2["run_id"] = np.nan
    df2["rul_hours"] = np.nan
    prev_end = df2.index.min()
    for _, r in failures_df.iterrows():
        failure_start = r["start"]
        run_id = int(r["nr"])
        mask = (df2.index > prev_end) & (df2.index <= failure_start)
        if mask.any():
            df2.loc[mask, "run_id"] = run_id
            df2.loc[mask, "rul_hours"] = (
                (failure_start - df2.index[mask]).total_seconds() / 3600.0)
        prev_end = r["end"]

    df2 = df2.dropna(subset=["run_id", "rul_hours"]).copy()
    df2["run_id"] = df2["run_id"].astype(int)
    df2["rul_cap"] = df2["rul_hours"].clip(upper=cap)
    return df2


def make_windows_with_groups(df_in, feature_cols, target_col, seq_len=180, stride=10):
    X_list, y_list, g_list = [], [], []
    for (rid, sid), g in df_in.groupby(["run_id", "segment_id"]):
        g = g.sort_index()
        Xv = g[feature_cols].values
        yv = g[target_col].values
        n = len(g)
        if n < seq_len:
            continue
        for start in range(0, n - seq_len + 1, stride):
            end = start + seq_len
            X_list.append(Xv[start:end])
            y_list.append(yv[end - 1])   # label at window end
            g_list.append(rid)           # group = run_id (failure cycle)
    return (np.array(X_list, dtype=np.float32),
            np.array(y_list, dtype=np.float32),
            np.array(g_list, dtype=np.int32))


def seq_to_tabular(X, feature_cols, digital=DIGITAL_COLS):
    mean = X.mean(axis=1)
    std = X.std(axis=1)
    mn = X.min(axis=1)
    mx = X.max(axis=1)
    rng = mx - mn
    last = X[:, -1, :]
    first = X[:, 0, :]
    slope = last - first
    dlast = last - mean
    energy = (X ** 2).mean(axis=1)

    f2i = {c: i for i, c in enumerate(feature_cols)}
    D = [f2i[c] for c in digital if c in f2i]
    if len(D) > 0:
        Xd = X[:, :, D]
        trans = (np.abs(np.diff(Xd, axis=1)) > 0).sum(axis=1)
    else:
        trans = np.zeros((X.shape[0], 0), dtype=np.float32)

    return np.concatenate(
        [mean, std, mn, mx, rng, last, slope, dlast, energy, trans], axis=1
    ).astype(np.float32)


def rul_features_window(w, feature_cols=FEATURE_COLS, digital=DIGITAL_COLS):
    """143 features for ONE (seq_len x n_channels) raw window (inference helper)."""
    return seq_to_tabular(np.asarray(w, dtype=np.float32)[None, ...], feature_cols, digital)[0]
