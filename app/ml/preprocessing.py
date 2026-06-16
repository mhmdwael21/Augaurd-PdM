"""Preprocessing ported verbatim from the notebooks.

`clean_resample_segment` reproduces the anomaly/RUL gap-handling EXACTLY
(Fault_Localization_PdM_Anomaly.ipynb cell 5):
  floor to 10s grid -> aggregate dups (analog mean, digital max) ->
  resample asfreq -> fill small gaps (analog time-interp limit 12, digital ffill)
  -> segment on gaps > 120s -> drop big-gap NaNs -> rebuild failure labels.

The classifier notebook uses a DIFFERENT recipe (round, interp limit 360); that
will be a separate function when we port the classifier branch.
"""
import pandas as pd

from .constants import ANALOG_COLS, DIGITAL_COLS, FAILURES


def load_raw_csv(path):
    df = pd.read_csv(path, parse_dates=["timestamp"], index_col="timestamp",
                     thousands=",", decimal=".")
    if "Unnamed: 0" in df.columns:
        df = df.drop(columns=["Unnamed: 0"])
    df = df.sort_index()
    df = df[~df.index.duplicated(keep="first")]
    return df


def add_failure_label(df, failures=FAILURES):
    df = df.copy()
    df["failure"] = 0
    for s, e in failures:
        s, e = pd.Timestamp(s), pd.Timestamp(e)
        df.loc[(df.index >= s) & (df.index < e), "failure"] = 1
    return df


def clean_resample_segment(df, expected="10s", small_gap="120s", big_gap="120s",
                           analog=ANALOG_COLS, digital=DIGITAL_COLS, failures=FAILURES):
    EXPECTED = expected
    SMALL_GAP_MAX = pd.Timedelta(small_gap)
    BIG_GAP_MIN = pd.Timedelta(big_gap)
    MEDIUM_MAX = int(SMALL_GAP_MAX / pd.Timedelta(EXPECTED))  # 12
    feature_cols = analog + digital

    # (1) snap to 10s grid, aggregate duplicates (analog mean, digital max)
    df2 = df.copy()
    df2.index = df2.index.floor(EXPECTED)
    agg = {c: "mean" for c in analog if c in df2.columns}
    agg.update({c: "max" for c in digital if c in df2.columns})
    keep = [c for c in feature_cols if c in df2.columns] + ["failure"]
    df2 = df2[keep].groupby(level=0).agg({**agg, "failure": "max"}).sort_index()

    # (2) regular 10s timeline
    time_diff = df2.index.to_series().diff()
    df_rs = df2.resample(EXPECTED).asfreq()
    rows_nan = df_rs[feature_cols].isna().any(axis=1)

    # gap-size series aligned to the grid (kept for parity with the notebook;
    # small_gap_rows is computed there but not used downstream)
    gap_starts = time_diff[time_diff > pd.Timedelta(EXPECTED)].index
    gap_starts_grid = pd.to_datetime(gap_starts).floor(EXPECTED)
    gap_sizes = time_diff.loc[gap_starts].copy()
    gap_sizes.index = gap_starts_grid
    gap_sizes = gap_sizes.groupby(level=0).max()
    gap_size = pd.Series(index=df_rs.index, data=pd.Timedelta(0))
    common = gap_sizes.index.intersection(df_rs.index)
    gap_size.loc[common] = gap_sizes.loc[common].values
    gap_size2 = gap_size.copy()
    gap_size2.loc[~rows_nan] = pd.NaT
    gap_size2.ffill().fillna(pd.Timedelta(0))  # noqa: matches notebook side-effect

    # (3) fill small gaps
    df_filled = df_rs.copy()
    dig = [c for c in digital if c in df_filled.columns]
    ana = [c for c in analog if c in df_filled.columns]
    df_filled[dig] = df_filled[dig].ffill().round()
    df_filled[ana] = df_filled[ana].interpolate(
        method="time", limit=MEDIUM_MAX, limit_direction="forward")

    # (4) segment on big gaps
    new_seg = (time_diff > BIG_GAP_MIN).reindex(df_filled.index, fill_value=False)
    new_seg.iloc[0] = True
    df_filled["segment_id"] = new_seg.cumsum()

    # (5) drop remaining (big-gap) NaNs and rebuild failure labels on the grid
    df_final = df_filled.dropna(subset=feature_cols).copy()
    df_final["failure"] = 0
    for s, e in failures:
        s, e = pd.Timestamp(s), pd.Timestamp(e)
        df_final.loc[(df_final.index >= s) & (df_final.index < e), "failure"] = 1
    return df_final
