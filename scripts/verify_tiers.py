"""Verify the graded-tier restructure against four explicit acceptance checks,
WITHOUT writing to the DB. Drives the real InferenceEngine through the exact
replay slices (same preprocessing + WARMUP as replay_service).

Checks per scenario:
  1. Does a WATCH/MEDIUM alert actually FIRE during the drift (an alert row, not
     just a badge color)?
  2. Is the RUL early-estimate in-regime and is that drift genuinely <72h from
     failure (legit, not luck)? Where in the pre-failure swing does it correctly
     show MONITORING (>72h) instead?
  3. Escalation per episode = 2-3 alerts (WATCH->...->FAILURE), never 1-all-critical,
     never 100.
  4. Drift-band noise: how often does the score wobble across 0.50 -> settle WATCH_N.
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ml.constants import FEATURE_COLS, DATASET_CSV, FAILURES
from app.ml.preprocessing import load_raw_csv, add_failure_label, clean_resample_segment
from app.ml.inference import InferenceEngine, WATCH_LO
from app.services.decision_service import build_alert_payload

WARMUP = 360
SCENARIOS = {
    "F4": ("2020-07-15 11:00", "2020-07-15 17:00"),
    "F3": ("2020-06-05 05:00", "2020-06-05 13:00"),
}
FAILURE_ONSET = {"F4": pd.Timestamp(FAILURES[3][0]), "F3": pd.Timestamp(FAILURES[2][0])}

print("loading + preprocessing full CSV ...")
DF = clean_resample_segment(add_failure_label(load_raw_csv(DATASET_CSV)))


def run(name):
    a, b = SCENARIOS[name]
    onset = FAILURE_ONSET[name]
    sl = DF[(DF.index >= a) & (DF.index <= b)]
    rows = list(zip([pd.Timestamp(t) for t in sl.index],
                    sl[FEATURE_COLS].to_numpy(dtype="float32")))

    eng = InferenceEngine()
    for ts, row in rows[:WARMUP]:          # warm (engine state evolves, no alerts)
        eng.push(row, ts=str(ts))

    ticks = []                              # collected from WARMUP onward (streamed)
    for ts, row in rows[WARMUP:]:
        snap = eng.push(row, ts=str(ts))
        if snap is None:
            continue
        sev = build_alert_payload(snap).severity.value if snap["detection"]["alert_event"] else None
        ticks.append((ts, snap, sev))

    print("\n" + "=" * 78)
    print(f"SCENARIO {name}   streamed {len(ticks)} ticks   failure onset {onset}")
    print("=" * 78)

    # ---- (1)+(3) alerts, grouped into episodes (a NORMAL tick closes an episode)
    episodes, cur = [], []
    for ts, snap, sev in ticks:
        st = snap["status"]
        if st == "NORMAL":
            if cur:
                episodes.append(cur); cur = []
        else:
            if sev:
                cur.append((ts, st, sev, snap))
    if cur:
        episodes.append(cur)

    print(f"\n[1+3] EPISODES = {len(episodes)}  (alerts per episode -> escalation)")
    for i, ep in enumerate(episodes, 1):
        seq = " -> ".join(f"{st}/{sev.upper()}" for _, st, sev, _ in ep)
        t0 = ep[0][0]
        print(f"   episode {i}: {len(ep)} alert(s)  @ {t0}   {seq}")

    # the WATCH/MEDIUM proof
    watch_alerts = [(ts, snap) for ts, snap, sev in ticks
                    if sev == "medium" and snap["status"] == "WATCH"]
    print(f"\n[1] WATCH/MEDIUM alerts fired: {len(watch_alerts)}")
    if watch_alerts:
        ts, snap = watch_alerts[0]
        hrs_out = (onset - ts).total_seconds() / 3600
        r = snap["rul"]
        print(f"    FIRST @ {ts}  ({hrs_out:+.2f}h from failure)")
        print(f"      predicted_failure: {build_alert_payload(snap).predicted_failure}")
        print(f"      RUL: available={r['available']} in_regime={r['in_regime']} "
              f"hours={r['hours']} early={r['early']} zone={r['zone']}")

    # ---- (2) RUL in-regime legitimacy vs. true hours-to-failure, pre-onset
    print("\n[2] RUL pre-onset: model regime vs. TRUE time-to-failure")
    pre = [(ts, snap) for ts, snap in ((t, s) for t, s, _ in ticks) if ts < onset]
    shown = [(ts, s) for ts, s in pre if s["rul"]["available"] and s["rul"]["in_regime"]]
    mon = [(ts, s) for ts, s in pre if s["rul"]["available"] and not s["rul"]["in_regime"]]
    print(f"    pre-onset ticks={len(pre)}  RUL-number shown={len(shown)}  MONITORING={len(mon)}")
    bad = [(ts, s) for ts, s in shown if (onset - ts).total_seconds() / 3600 > 72]
    print(f"    illegitimate (number shown while TRUE >72h out): {len(bad)}  "
          f"{'<-- PROBLEM' if bad else 'OK (every shown number is genuinely <72h out)'}")
    if mon:
        ts, s = mon[0]
        print(f"    e.g. MONITORING @ {mon[0][0]} (true {(onset-mon[0][0]).total_seconds()/3600:.1f}h out)")
    if shown:
        ts, s = shown[0]
        print(f"    first number @ {ts}  RUL={s['rul']['hours']:.1f}h  "
              f"true {(onset-ts).total_seconds()/3600:.2f}h out")

    # ---- (4) drift-band noise: 0.50 crossings across the pre-onset swing
    scores = [s["anomaly"]["score"] for ts, s, _ in ticks if ts < onset]
    crossings = sum(1 for x, y in zip(scores, scores[1:])
                    if (x < WATCH_LO) != (y < WATCH_LO))
    in_band = sum(1 for x in scores if WATCH_LO <= x < 0.65)
    print(f"\n[4] drift-band noise (pre-onset): {crossings} crossings of 0.50 over "
          f"{len(scores)} ticks; {in_band} ticks in [0.50,0.65)")
    print(f"    min/max score pre-onset: {min(scores):.3f} / {max(scores):.3f}")


for name in ("F4", "F3"):
    run(name)
print("\ndone.")
