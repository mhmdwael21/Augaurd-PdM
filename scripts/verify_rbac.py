"""Ad-hoc RBAC verification — logs in as admin/tech/op and checks the rules.

Read-only except for one harmless assign test. Run against a live backend.
"""
import sys
import requests

BASE = "http://localhost:8000"
CREDS = {"admin": "admin123", "technician": "tech123", "operator": "op123"}

results = []
def check(name, cond, detail=""):
    results.append((cond, name, detail))
    print(f"[{'PASS' if cond else 'FAIL'}] {name}  {detail}")

def login(u, p):
    r = requests.post(f"{BASE}/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        return None
    return r.json()["access_token"]

def H(tok):
    return {"Authorization": f"Bearer {tok}"}

# ── Login (seed if needed) ───────────────────────────────────────────
tok = {u: login(u, p) for u, p in CREDS.items()}
if not all(tok.values()):
    print("Some logins failed — run scripts/seed_users.py first.")
    print({u: bool(t) for u, t in tok.items()})
    sys.exit(1)
admin, tech, op = tok["admin"], tok["technician"], tok["operator"]

# ── Reads: operator sees all (== admin); technician sees subset ──────
def count(path, t):
    r = requests.get(f"{BASE}{path}", headers=H(t))
    return r.status_code, (len(r.json()) if r.status_code == 200 and isinstance(r.json(), list) else None)

for label, path in [("alerts", "/alerts/"), ("work-orders", "/work-orders/"),
                    ("maintenance", "/maintenance-records/")]:
    sa, ca = count(path, admin)
    so, co = count(path, op)
    st, ct = count(path, tech)
    check(f"{label}: operator sees all (op={co} == admin={ca})", co == ca and so == 200,
          f"admin={ca} op={co} tech={ct}")
    check(f"{label}: technician sees <= admin (tech={ct})", ct is not None and ct <= ca,
          f"tech={ct} admin={ca}")

# ── User ids for assign tests ───────────────────────────────────────
users = requests.get(f"{BASE}/auth/users", headers=H(admin)).json()
# Target the exact users we log in as (there may be several techs/operators).
op_id = next((u["id"] for u in users if u["username"] == "operator"), None)
tech_id = next((u["id"] for u in users if u["username"] == "technician"), None)

alerts = requests.get(f"{BASE}/alerts/", headers=H(admin)).json()
unassigned = next((a for a in alerts if not a.get("assigned_to") and a.get("status") != "resolved"), None)

# ── Assign alert to operator → 400 ──────────────────────────────────
if unassigned and op_id:
    r = requests.put(f"{BASE}/alerts/{unassigned['id']}/assign", headers=H(admin),
                     json={"assigned_to": op_id})
    check("assign alert to OPERATOR rejected (400)", r.status_code == 400, f"got {r.status_code}: {r.text[:80]}")
else:
    check("assign alert to OPERATOR rejected (400)", False, "no unassigned alert or no operator to test with")

# ── Operator write blocked: POST /maintenance-records → 403 ─────────
r = requests.post(f"{BASE}/maintenance-records/", headers=H(op),
                  json={"equipment_id": None, "maintenance_type": "inspection",
                        "action_taken": "rbac-test", "outcome": "inconclusive"})
check("operator POST /maintenance-records blocked (403)", r.status_code == 403, f"got {r.status_code}")

# ── Operator update alert status blocked ────────────────────────────
if alerts:
    r = requests.put(f"{BASE}/alerts/{alerts[0]['id']}/status", headers=H(op),
                     json={"status": "acknowledged"})
    check("operator PUT alert status blocked (403)", r.status_code == 403, f"got {r.status_code}")

# ── WO assign to operator → 400 ─────────────────────────────────────
wos = requests.get(f"{BASE}/work-orders/", headers=H(admin)).json()
wo_unassigned = next((w for w in wos if not w.get("assigned_to") and w.get("status") in ("open", "in_progress")), None)
if wo_unassigned and op_id:
    r = requests.put(f"{BASE}/work-orders/{wo_unassigned['id']}/assign", headers=H(admin),
                     json={"assigned_to": op_id})
    check("assign WORK ORDER to OPERATOR rejected (400)", r.status_code == 400, f"got {r.status_code}: {r.text[:80]}")
else:
    check("assign WORK ORDER to OPERATOR rejected (400)", False, "no unassigned WO or no operator")

# ── HAPPY PATH: technician can receive + act on assigned work ───────
equip = requests.get(f"{BASE}/equipment/", headers=H(admin)).json()
equip_id = equip[0]["id"] if equip else None

if unassigned and tech_id:
    r = requests.put(f"{BASE}/alerts/{unassigned['id']}/assign", headers=H(admin),
                     json={"assigned_to": tech_id})
    check("assign alert to TECHNICIAN ok (200)", r.status_code == 200, f"got {r.status_code}")
    _, ct2 = count("/alerts/", tech)
    check("technician now sees their assigned alert (>=1)", (ct2 or 0) >= 1, f"tech now sees {ct2}")
    r = requests.put(f"{BASE}/alerts/{unassigned['id']}/status", headers=H(tech),
                     json={"status": "acknowledged"})
    check("technician acknowledges assigned alert (200)", r.status_code == 200, f"got {r.status_code}")
else:
    check("assign alert to TECHNICIAN ok (200)", False, "no unassigned alert / technician")

if equip_id:
    r = requests.post(f"{BASE}/maintenance-records/", headers=H(tech),
                      json={"equipment_id": equip_id, "maintenance_type": "inspection",
                            "action_taken": "rbac-verify inspection", "outcome": "inconclusive"})
    check("technician POST /maintenance-records allowed (201)", r.status_code == 201, f"got {r.status_code}: {r.text[:80]}")

# ── Summary ─────────────────────────────────────────────────────────
passed = sum(1 for c, *_ in results if c)
print(f"\n{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 2)
