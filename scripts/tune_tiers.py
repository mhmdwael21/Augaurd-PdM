"""Settle WATCH_N / RECOVER_N with data. Records the real per-tick (score, RUL
in_regime, RUL hours) once through the InferenceEngine (cached to JSON), then
replays the state machine OFFLINE for a grid of params to count episodes and
the alert escalation per episode. Lets us pick params without re-running the LSTM.
"""
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ml.constants import FEATURE_COLS, DATASET_CSV, FAILURES

CACHE = Path(__file__).resolve().parent / ".tier_series.json"
WARMUP = 360
SCENARIOS = {"F4": ("2020-07-15 11:00", "2020-07-15 17:00"),
             "F3": ("2020-06-05 05:00", "2020-06-05 13:00")}
ONSET = {"F4": FAILURES[3][0], "F3": FAILURES[2][0]}
RANK = {"NORMAL": 0, "WATCH": 1, "ANOMALY": 2, "FAILURE": 3}
RTIER = {v: k for k, v in RANK.items()}


def record():
    """One real pass per scenario -> minimal per-tick series, cached."""
    from app.ml.preprocessing import load_raw_csv, add_failure_label, clean_resample_segment
    from app.ml.inference import InferenceEngine
    print("recording real series (one LSTM pass per scenario) ...")
    df = clean_resample_segment(add_failure_label(load_raw_csv(DATASET_CSV)))
    out = {}
    for name, (a, b) in SCENARIOS.items():
        sl = df[(df.index >= a) & (df.index <= b)]
        rows = list(zip([str(t) for t in sl.index],
                        sl[FEATURE_COLS].to_numpy(dtype="float32")))
        eng = InferenceEngine()
        for ts, row in rows[:WARMUP]:
            eng.push(row, ts=ts)
        series = []
        for ts, row in rows[WARMUP:]:
            s = eng.push(row, ts=ts)
            if s is None:
                continue
            series.append([ts, s["anomaly"]["score"],
                           bool(s["rul"]["in_regime"]), s["rul"]["hours"]])
        out[name] = series
        print(f"  {name}: {len(series)} ticks")
    CACHE.write_text(json.dumps(out))
    return out


def simulate(series, WATCH_N, RECOVER_N, LATCH_N=3, FAIL_SCORE=0.90, FAIL_RUL=12):
    """Faithful offline replay of inference._advance_state for given params."""
    consec = watch = below = alerted = 0
    state, episode_active = "NORMAL", False
    episodes, cur = [], []
    for ts, score, in_regime, hours in series:
        flagged = score >= 0.65
        elevated = score >= 0.50
        failure = score >= FAIL_SCORE or (in_regime and hours is not None and hours < FAIL_RUL)
        consec = consec + 1 if flagged else 0
        if elevated:
            watch += 1; below = 0
        else:
            watch = 0; below += 1

        alert = False
        if episode_active and below >= RECOVER_N:
            state, episode_active, alerted = "NORMAL", False, 0
        else:
            if consec >= LATCH_N:
                rank = 3 if failure else 2
            elif RANK[state] >= 2 and failure:
                rank = 3
            elif watch >= WATCH_N:
                rank = 1
            elif episode_active:
                rank = RANK[state]
            else:
                state = "WATCH" if score >= 0.50 else "NORMAL"
                rank = None
            if rank is not None:
                rank = max(rank, RANK[state]); state = RTIER[rank]
                if rank >= 1:
                    episode_active = True
                if rank > alerted:
                    alert = True; alerted = rank
        if state == "NORMAL":
            if cur: episodes.append(cur); cur = []
        elif alert:
            cur.append((ts, state))
    if cur: episodes.append(cur)
    return episodes


def summarize(episodes):
    total = sum(len(e) for e in episodes)
    reached_fail = any(any(st == "FAILURE" for _, st in e) for e in episodes)
    multi = [e for e in episodes if len(e) >= 2]
    return total, len(episodes), len(multi), reached_fail


series = json.loads(CACHE.read_text()) if CACHE.exists() else record()

GRID_W = [6, 12, 18]
GRID_R = [5, 15, 30, 45]
for name in ("F4", "F3"):
    print("\n" + "=" * 72)
    print(f"{name}  (onset {ONSET[name]})   grid = WATCH_N x RECOVER_N")
    print("=" * 72)
    print(f"{'':8}" + "".join(f"R={r:<10}" for r in GRID_R))
    for w in GRID_W:
        cells = []
        for r in GRID_R:
            eps = simulate(series[name], w, r)
            total, n_ep, n_multi, fail = summarize(eps)
            cells.append(f"{n_ep}ep/{total}al{'*' if fail else ''}")
        print(f"W={w:<5}" + "".join(f"{c:<12}" for c in cells))
    print("  legend: <episodes>ep/<total alerts>al  (* = an episode reached FAILURE)")

# detailed view at a recommended setting
print("\n" + "-" * 72)
for name in ("F4", "F3"):
    eps = simulate(series[name], 12, 30)
    print(f"\n{name} @ WATCH_N=12 RECOVER_N=30:")
    for i, e in enumerate(eps, 1):
        seq = " -> ".join(st for _, st in e)
        print(f"   episode {i}: {len(e)} alert(s) @ {e[0][0]}  {seq}")
