"""Phase 1 parity gate — RUL branch.

Reproduces the notebook's deterministic shape fingerprints AND the headline
LOFO LightGBM MAE, using the ported preprocessing + feature builder.

Notebook targets:
  rows after gap handling : 1514745   segments: 324
  rows after run slicing  : 1142812
  all windows             : (110648, 180, 15)
  tabular features        : (110648, 143)
  degradation windows     : 8475   (per-run: r1 2285, r2 2373, r3 2097, r4 1720)
  LightGBM LOFO MAE       : 21.567 +/- 5.006 h
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error

from app.ml.constants import FEATURE_COLS, DATASET_CSV
from app.ml.preprocessing import load_raw_csv
from app.ml.rul import (clean_resample_rul, rul_failures, build_runs_and_rul,
                        make_windows_with_groups, seq_to_tabular, rul_feature_names)
from app.ml.artifacts import load_rul

print("1/6 preprocess (RUL recipe) ...")
df_final = clean_resample_rul(load_raw_csv(DATASET_CSV))
print(f"     rows={len(df_final)} (exp 1514745)  segments={df_final['segment_id'].nunique()} (exp 324)")

print("2/6 build runs + RUL ...")
df2 = build_runs_and_rul(df_final, rul_failures())
print(f"     rows after run slicing={len(df2)} (exp 1142812)")

print("3/6 window (180/10, raw channels) ...")
X_seq, y_all, groups = make_windows_with_groups(df2, FEATURE_COLS, "rul_cap", 180, 10)
print(f"     X_seq={X_seq.shape} (exp (110648, 180, 15))")

print("4/6 seq_to_tabular ...")
X_tab = seq_to_tabular(X_seq, FEATURE_COLS)
print(f"     X_tab={X_tab.shape} (exp (110648, 143))")

deg = y_all <= 72.0
X_d, y_d, g_d = X_tab[deg], y_all[deg], groups[deg]
per_run = {int(r): int((g_d == r).sum()) for r in sorted(np.unique(g_d))}
print(f"     degradation windows={X_d.shape[0]} (exp 8475)  per-run={per_run} (exp 1:2285 2:2373 3:2097 4:1720)")

print("5/6 feature-name parity vs rul_feature_cols.pkl ...")
_, scaler_prod, saved_cols, _ = load_rul()
built_cols = rul_feature_names()
print(f"     names match saved: {built_cols == list(saved_cols)} ({len(built_cols)} feats)")

print("6/6 LOFO LightGBM (reproduce headline MAE) ...")
import lightgbm as lgb
lgb_params = dict(objective="regression", n_estimators=4000, learning_rate=0.01,
                  num_leaves=64, max_depth=-1, subsample=0.9, colsample_bytree=0.9,
                  reg_lambda=1.0, random_state=42, n_jobs=-1)
maes = []
for test_run in sorted(np.unique(g_d)):
    tr, te = g_d != test_run, g_d == test_run
    sc = StandardScaler()
    Xtr = sc.fit_transform(X_d[tr]); Xte = sc.transform(X_d[te])
    m = lgb.LGBMRegressor(**lgb_params)
    m.fit(Xtr, y_d[tr])
    mae = mean_absolute_error(y_d[te], m.predict(Xte))
    maes.append(mae)
    print(f"     run {int(test_run)}: MAE {mae:.3f}")
maes = np.array(maes)
print(f"\nLOFO MAE mean+/-std: {maes.mean():.3f} +/- {maes.std():.3f}  (exp 21.567 +/- 5.006)")

print("\n--- RUL PARITY SUMMARY ---")
shapes_ok = (len(df_final) == 1514745 and df_final['segment_id'].nunique() == 324
             and len(df2) == 1142812 and X_seq.shape == (110648, 180, 15)
             and X_tab.shape == (110648, 143) and X_d.shape[0] == 8475
             and per_run == {1: 2285, 2: 2373, 3: 2097, 4: 1720})
names_ok = built_cols == list(saved_cols)
mae_ok = abs(maes.mean() - 21.567) < 0.5
print("shapes/fingerprints:", "MATCH" if shapes_ok else "MISMATCH")
print("feature names      :", "MATCH" if names_ok else "MISMATCH")
print("LOFO MAE           :", "MATCH" if mae_ok else "MISMATCH")
