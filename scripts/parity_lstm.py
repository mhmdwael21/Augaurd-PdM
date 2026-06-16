"""Phase 1 parity gate — IF-gated LSTM fault localization.

Reproduces, in backend code, the notebook's gated-localization result:
detection by the IF, localization by the LSTM on IF-flagged windows only.
Colab target: ~4883 IF-flagged, 1862 true-failure windows, ~89% 'Pressure Fault'
on the true-failure subset (air leak).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pandas as pd

from app.ml.constants import FEATURE_COLS, ANALOG_COLS, CUT_DATE, DATASET_CSV
from app.ml.preprocessing import load_raw_csv, add_failure_label, clean_resample_segment
from app.ml.features import (build_if_features, build_lstm_windows,
                             lstm_per_sensor_error, classify_fault)
from app.ml.artifacts import load_anomaly_if, load_lstm_localizer

print("1/5 preprocess ...")
df_final = clean_resample_segment(add_failure_label(load_raw_csv(DATASET_CSV)))
test = df_final[df_final.index >= pd.Timestamp(CUT_DATE)].copy()

print("2/5 scale + IF detect ...")
iso, thr, scaler, _ = load_anomaly_if()
test[FEATURE_COLS] = scaler.transform(test[FEATURE_COLS])
X_if, m_if = build_if_features(test, FEATURE_COLS, 60, 10)
m_if["if_alert"] = (-iso.decision_function(X_if) >= thr).astype(int)
if_anom = m_if[m_if["if_alert"] == 1]

print("3/5 LSTM windows + reconstruct ...")
lstm, _, _ = load_lstm_localizer()
X_lstm, m_lstm = build_lstm_windows(test, FEATURE_COLS, 60, 5)
X_pred = lstm.predict(X_lstm, batch_size=256, verbose=0)
pse = pd.DataFrame(lstm_per_sensor_error(X_lstm, X_pred, FEATURE_COLS, ANALOG_COLS),
                   columns=FEATURE_COLS)
pse["window_end_time"] = m_lstm["window_end_time"].values

print("4/5 gate localization on IF-flagged windows ...")
loc = if_anom.merge(pse, on="window_end_time", how="inner")
loc["top_sensors"] = loc[FEATURE_COLS].apply(
    lambda r: r.astype(float).nlargest(3).index.tolist(), axis=1)
loc["fault_type"] = loc["top_sensors"].apply(classify_fault)

print("5/5 fingerprint ...")
true_fail = loc[loc["failure_window"] == 1]
print(f"\nIF-flagged windows: {len(if_anom)}  |  localized: {len(loc)}  |  true-failure: {len(true_fail)}")
print("\nFault-type % - IF-flagged TRUE-failure windows only:")
print((true_fail["fault_type"].value_counts(normalize=True) * 100).round(1))
pressure_pct = (true_fail["fault_type"] == "Pressure Fault").mean() * 100
print(f"\nGot      : {len(if_anom)} flagged, {len(true_fail)} true-failure, "
      f"{pressure_pct:.1f}% Pressure")
print("Expected : ~4883 flagged, 1862 true-failure, ~89% Pressure")
