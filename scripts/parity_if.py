"""Phase 1 parity gate — Isolation Forest anomaly branch.

Runs the ported backend preprocessing + feature builder + saved IF on the local
raw CSV and checks it reproduces the notebook's test-set confusion matrix.
Notebook target (cut at 2020-06-01): TN 60545, FP 3021, FN 9, TP 1862, ROC-AUC ~0.9573.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # project root -> `app` importable

import pandas as pd
from sklearn.metrics import confusion_matrix, roc_auc_score

from app.ml.constants import FEATURE_COLS, CUT_DATE, DATASET_CSV
from app.ml.preprocessing import load_raw_csv, add_failure_label, clean_resample_segment
from app.ml.features import build_if_features
from app.ml.artifacts import load_anomaly_if

print("1/4 load + label CSV ...")
df = add_failure_label(load_raw_csv(DATASET_CSV))

print("2/4 gap handling ...")
df_final = clean_resample_segment(df)
print(f"     rows={len(df_final)}  segments={df_final['segment_id'].nunique()}")

print("3/4 scale + build IF features (window 60, step 10) ...")
iso, thr, scaler, meta = load_anomaly_if()
test = df_final[df_final.index >= pd.Timestamp(CUT_DATE)].copy()
test[FEATURE_COLS] = scaler.transform(test[FEATURE_COLS])
X, m = build_if_features(test, FEATURE_COLS, 60, 10)
print(f"     X={X.shape}")

print("4/4 score + evaluate ...")
score = -iso.decision_function(X)
alert = (score >= thr).astype(int)
y = m["failure_window"].values
cm = confusion_matrix(y, alert)
(tn, fp), (fn, tp) = cm

print("\n--- PARITY RESULT ---")
print(f"Confusion [[TN FP],[FN TP]]:\n{cm}")
print(f"ROC-AUC: {roc_auc_score(y, score):.4f}")
print(f"\nGot      : TN {tn}  FP {fp}  FN {fn}  TP {tp}")
print(f"Expected : TN 60545  FP 3021  FN 9  TP 1862")
ok = (tn, fp, fn, tp) == (60545, 3021, 9, 1862)
print("\nPARITY:", "EXACT MATCH" if ok else "MISMATCH - investigate")
