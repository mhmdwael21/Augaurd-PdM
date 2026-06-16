"""Phase 1 parity gate — classifier branch.

Reproduces the notebook's shape fingerprints + binary classifier ROC-AUC using
the ported preprocessing + 43-feature builder + saved XGBoost.

Notebook targets:
  rows after resample : 1586862   segments: 156
  run counts          : 1:591555 2:290210 3:67134 4:637963
  windowed features   : (25570, 48)  -> 43 feature cols
  windowed labels     : 0:25067 1:144 2:39 3:293 4:27
  test (run 4)        : (10295, 43)
  binary ROC-AUC (full test) : 0.9310
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sklearn.metrics import roc_auc_score

from app.ml.constants import DATASET_CSV
from app.ml.classifier import (clean_resample_classifier, build_classifier_features,
                               classifier_feature_names)
from app.ml.artifacts import load_classifier

print("1/5 preprocess (classifier recipe) ...")
df = clean_resample_classifier(DATASET_CSV)
runs = df["run_id"].value_counts().sort_index().to_dict()
print(f"     rows={len(df)} (exp 1586862)  segments={df['segment_id'].nunique()} (exp 156)")
print(f"     run counts={runs} (exp 1:591555 2:290210 3:67134 4:637963)")

print("2/5 window (360/60) -> features ...")
fdf = build_classifier_features(df)
lab = fdf["failure_label"].astype(int).value_counts().sort_index().to_dict()
print(f"     features_df={fdf.shape} (exp (25570, 48))  labels={lab} (exp 0:25067 1:144 2:39 3:293 4:27)")

print("3/5 feature-name parity vs xgb_feature_cols.pkl ...")
clf, scaler, saved_cols = load_classifier()
FEATURE_COLS = classifier_feature_names()
names_ok = FEATURE_COLS == list(saved_cols)
print(f"     names match saved: {names_ok} ({len(FEATURE_COLS)} feats)")

print("4/5 split run4 + scale ...")
test = fdf[fdf["run_id"] == 4]
X_test = test[FEATURE_COLS]
y_bin = (test["failure_label"].astype(int) > 0).astype(int)
X_scaled = scaler.transform(X_test)
print(f"     X_test={X_test.shape} (exp (10295, 43))")

print("5/5 predict + ROC-AUC ...")
proba = clf.predict_proba(X_scaled)[:, 1]
auc = roc_auc_score(y_bin, proba)
print(f"     binary ROC-AUC (full test) = {auc:.4f}  (calibrated model ~0.945; old overfit was 0.931)")

print("\n--- CLASSIFIER PARITY SUMMARY ---")
shapes_ok = (len(df) == 1586862 and df["segment_id"].nunique() == 156
             and runs == {1: 591555, 2: 290210, 3: 67134, 4: 637963}
             and fdf.shape == (25570, 48) and X_test.shape == (10295, 43)
             and lab == {0: 25067, 1: 144, 2: 39, 3: 293, 4: 27})
auc_ok = auc > 0.90  # sanity: calibrated model should still rank well
print("shapes/fingerprints:", "MATCH" if shapes_ok else "MISMATCH")
print("feature names      :", "MATCH" if names_ok else "MISMATCH")
print("model ROC-AUC sane :", "OK" if auc_ok else "LOW")
