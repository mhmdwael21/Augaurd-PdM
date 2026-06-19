"""Compute per-channel baseline constants for the hardware Track-A padded row.

Baseline = median of TRAINING-NORMAL data (failure == 0, before CUT_DATE), taken
on the SAME cleaned 10s grid the models were trained on, so the constants live in
the same value space the existing preprocessing expects.

These constants fill the 13 channels the ESP32 prototype does NOT measure
(including the broken TP3). TP2 and Reservoirs come live from the board, so their
baseline values here are only fallbacks — never used while the link is up.

Run once:  python scripts/compute_baseline.py
Output:    AI/models/baseline_medians.json
"""
import json
import sys
from pathlib import Path

# allow running from the repo root without installing the package
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from app.ml.constants import FEATURE_COLS, CUT_DATE, MODELS_DIR, DATASET_CSV
from app.ml.preprocessing import (load_raw_csv, add_failure_label,
                                  clean_resample_segment)

OUT = MODELS_DIR / "baseline_medians.json"


def main():
    print(f"Loading raw dataset: {DATASET_CSV}")
    df = load_raw_csv(DATASET_CSV)
    print(f"  rows: {len(df):,}")

    print("Cleaning to 10s grid (reusing clean_resample_segment) ...")
    df_final = clean_resample_segment(add_failure_label(df))
    print(f"  grid rows: {len(df_final):,}")

    cut = pd.Timestamp(CUT_DATE)
    normal = df_final[(df_final.index < cut) & (df_final["failure"] == 0)]
    print(f"  training-normal rows (pre {CUT_DATE}, failure==0): {len(normal):,}")

    medians = {c: float(normal[c].median()) for c in FEATURE_COLS}

    OUT.write_text(json.dumps(medians, indent=2))
    print(f"\nWrote {OUT}")
    for c in FEATURE_COLS:
        print(f"  {c:18s} {medians[c]:.4f}")


if __name__ == "__main__":
    main()
