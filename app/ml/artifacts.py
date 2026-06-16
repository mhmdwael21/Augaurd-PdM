"""Loaders for the saved model artifacts (AI/models/).

Loaded once at startup in the real backend; here they're plain functions so
parity scripts and the inference service share the same loading code.
"""
import json

import joblib

from .constants import MODELS_DIR


def _meta(name):
    with open(MODELS_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def load_anomaly_if():
    """Isolation Forest anomaly detector + raw threshold + shared StandardScaler."""
    iso = joblib.load(MODELS_DIR / "if_anomaly.pkl")
    threshold = joblib.load(MODELS_DIR / "if_threshold.pkl")
    scaler = joblib.load(MODELS_DIR / "lstm_scaler_sd.pkl")  # shared StandardScaler (raw channels)
    return iso, threshold, scaler, _meta("if_metadata.json")


def load_lstm_localizer():
    """LSTM autoencoder + shared StandardScaler + metadata (localization only)."""
    import keras  # imported lazily so non-LSTM paths don't pay the TF import cost
    model = keras.models.load_model(MODELS_DIR / "lstm_ae.keras", compile=False)
    scaler = joblib.load(MODELS_DIR / "lstm_scaler_sd.pkl")
    return model, scaler, _meta("lstm_metadata.json")


def load_rul():
    """LightGBM RUL regressor + StandardScaler (on 143 feats) + feature names + metadata."""
    model = joblib.load(MODELS_DIR / "rul_lgbm.pkl")
    scaler = joblib.load(MODELS_DIR / "rul_scaler_sd.pkl")
    feature_cols = joblib.load(MODELS_DIR / "rul_feature_cols.pkl")
    return model, scaler, feature_cols, _meta("rul_metadata.json")


def load_classifier():
    """Calibrated binary classifier (CalibratedClassifierCV over regularized XGB)
    + MinMaxScaler (on 43 feats) + feature names. predict_proba API unchanged."""
    clf = joblib.load(MODELS_DIR / "xgb_classifier_calibrated.pkl")
    scaler = joblib.load(MODELS_DIR / "xgb_scaler_minmax.pkl")
    feature_cols = joblib.load(MODELS_DIR / "xgb_feature_cols.pkl")
    return clf, scaler, feature_cols
