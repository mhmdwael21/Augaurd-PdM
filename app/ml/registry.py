"""Model registry — loads every artifact once and caches it.

In the FastAPI app this is created at startup so the TensorFlow/LightGBM/XGBoost
load cost is paid a single time, not per request.
"""
from .artifacts import (load_anomaly_if, load_lstm_localizer,
                        load_rul, load_classifier)


class Registry:
    def __init__(self):
        self.iso, self.if_threshold, self.if_scaler, self.if_meta = load_anomaly_if()
        self.lstm, self.lstm_scaler, self.lstm_meta = load_lstm_localizer()
        self.rul_model, self.rul_scaler, self.rul_cols, self.rul_meta = load_rul()
        self.clf, self.clf_scaler, self.clf_cols = load_classifier()


_registry = None


def get_registry():
    global _registry
    if _registry is None:
        _registry = Registry()
    return _registry
