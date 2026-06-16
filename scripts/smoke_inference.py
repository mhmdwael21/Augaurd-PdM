"""Phase 2 smoke test — feed real rows around F4 through the InferenceEngine.

Confirms the engine produces a coherent snapshot stream:
  healthy -> NORMAL low score; into F4 -> ANOMALY, score climbs, RUL appears
  and drops, localization = Pressure Fault.
Also reports the raw IF score range so we can tune the display upper anchor.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from app.ml.constants import FEATURE_COLS, DATASET_CSV
from app.ml.preprocessing import load_raw_csv, add_failure_label, clean_resample_segment
from app.ml.inference import InferenceEngine

print("preprocess + slice around F4 ...")
df = clean_resample_segment(add_failure_label(load_raw_csv(DATASET_CSV)))
sl = df[(df.index >= "2020-07-15 12:00") & (df.index <= "2020-07-15 16:30")]
print(f"slice rows: {len(sl)}  ({sl.index.min()} -> {sl.index.max()})")

eng = InferenceEngine()
rows = sl[FEATURE_COLS].values
times = sl.index

snaps = []
for t, r in zip(times, rows):
    s = eng.push(r, ts=str(t))
    if s is not None:
        snaps.append((t, s))

print(f"snapshots: {len(snaps)}\n")
print(f"{'time':19} {'status':8} {'score':>5} {'raw':>7}  {'clf':8} {'rul':>6} {'zone':11} {'loc'}")
for t, s in snaps[:: max(1, len(snaps) // 16)]:
    a, c, r, l = s["anomaly"], s["classifier"], s["rul"], s["localization"]
    rul = f"{r['hours']:.1f}" if r["available"] else "--"
    print(f"{str(t):19} {s['status']:8} {a['score']:.2f}  {a['raw_score']:+.3f}  "
          f"{c['verdict']:8} {rul:>6} {r['zone']:11} {l['fault_type'] or '--'}")

raws = [s["anomaly"]["raw_score"] for _, s in snaps]
norms = [s["anomaly"]["score"] for _, s in snaps]
print(f"\nraw score range : {min(raws):+.4f} .. {max(raws):+.4f}  (thr {eng.if_thr:+.4f})")
print(f"normalized range: {min(norms):.2f} .. {max(norms):.2f}  (display hi anchor {eng.if_hi:+.4f})")

last = snaps[-1][1]
if last["localization"]["available"]:
    print("\nlast localization top3:",
          [(p["sensor"], round(p["error"], 3)) for p in last["localization"]["top3"]])
    print("per_sensor count:", len(last["localization"]["per_sensor"]))
