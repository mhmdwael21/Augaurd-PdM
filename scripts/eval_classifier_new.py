"""Evaluate the downloaded calibrated classifier + reproduce the LOFO verdict."""
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.exceptions import InconsistentVersionWarning
from sklearn.metrics import roc_auc_score, brier_score_loss
from sklearn.preprocessing import MinMaxScaler
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

from app.ml.constants import DATASET_CSV, MODELS_DIR
from app.ml.classifier import (clean_resample_classifier, build_classifier_features,
                               classifier_feature_names)

# ── load the downloaded model; flag version mismatch ──────────────────
print("loading downloaded calibrated model ...")
with warnings.catch_warnings():
    warnings.simplefilter("error", InconsistentVersionWarning)
    try:
        clf = joblib.load(MODELS_DIR / "xgb_classifier_calibrated.pkl")
        print("  loaded clean (sklearn version matches 1.6.1)")
        version_ok = True
    except InconsistentVersionWarning as e:
        version_ok = False
        print("  VERSION MISMATCH:", str(e).splitlines()[0])
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            clf = joblib.load(MODELS_DIR / "xgb_classifier_calibrated.pkl")
print("  type:", type(clf).__name__)

scaler = joblib.load(MODELS_DIR / "xgb_scaler_minmax.pkl")
FEATURE_COLS = classifier_feature_names()

# ── rebuild features (parity-proven pipeline) ─────────────────────────
print("\nrebuilding features ...")
df = clean_resample_classifier(DATASET_CSV)
fdf = build_classifier_features(df)
test = fdf[fdf["run_id"] == 4]
Xte = test[FEATURE_COLS]
yte = (test["failure_label"].astype(int) > 0).astype(int).values
deg = (test["in_degradation"] == 1).values

# ── production-model verdict on the held-out F4 run ───────────────────
p = clf.predict_proba(scaler.transform(Xte))[:, 1]
print("\n=== DOWNLOADED MODEL on test run 4 (F4) ===")
print("full-test ROC-AUC :", round(roc_auc_score(yte, p), 4), " (old overfit model was 0.931)")
print("Brier score       :", round(brier_score_loss(yte, p), 4))
print("P(anom) percentiles [50,90,99,max]:", np.round(np.percentile(p, [50, 90, 99, 100]), 3))
print("degradation zone — mean P(anom) on F4 failures:", round(p[deg & (yte == 1)].mean(), 3))
print("degradation zone — mean P(anom) on normals    :", round(p[deg & (yte == 0)].mean(), 3))
print("F4 failure windows >= 0.60 gate:", round(float((p[deg & (yte == 1)] >= 0.60).mean()), 3))

# ── reproduce LOFO (the generalization verdict) ───────────────────────
print("\n=== LOFO (reproduced locally; matches the notebook's 15c) ===")
BIN_PARAMS = dict(objective="binary:logistic", n_estimators=80, max_depth=3,
                  learning_rate=0.05, subsample=0.8, colsample_bytree=0.8,
                  min_child_weight=10, reg_lambda=5.0, random_state=42,
                  n_jobs=-1, eval_metric="auc")
X_all = fdf[FEATURE_COLS]
y_all = (fdf["failure_label"].astype(int) > 0).astype(int)
groups = fdf["run_id"].astype(int)
rows = []
for tr_run in sorted(groups.unique()):
    tr, te = groups != tr_run, groups == tr_run
    if y_all[te].nunique() < 2:
        continue
    sc = MinMaxScaler().fit(X_all[tr])
    m = CalibratedClassifierCV(estimator=XGBClassifier(**BIN_PARAMS), method="isotonic", cv=3)
    m.fit(sc.transform(X_all[tr]), y_all[tr], sample_weight=compute_sample_weight("balanced", y_all[tr]))
    pp = m.predict_proba(sc.transform(X_all[te]))[:, 1]
    pos = pp[y_all[te].values == 1]
    rows.append({"held_out_run": int(tr_run), "test_failures": int(y_all[te].sum()),
                 "ROC_AUC": round(roc_auc_score(y_all[te], pp), 3),
                 "mean_conf_on_failure": round(float(pos.mean()), 3),
                 "frac>=0.60": round(float((pos >= 0.60).mean()), 3)})
lofo = pd.DataFrame(rows)
print(lofo.to_string(index=False))
print("LOFO ROC-AUC mean +/- std:", round(lofo["ROC_AUC"].mean(), 3), "+/-", round(lofo["ROC_AUC"].std(), 3))
print("\nversion_ok:", version_ok)
