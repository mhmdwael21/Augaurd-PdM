# AuGuard — RBAC Rules & Workflow Plan

> Design reference for the role/permission rework. **Additive-only; the ML
> pipeline and `FEATURE_COLS` are untouched.** This document defines the *target*
> rules and the file-by-file build plan to reach them. Read alongside
> `AUGUARD_CONTEXT.md` (Section 11 = roles, Sections 23–25 = the operational loop).

_Status: design approved (decisions 1–3 locked). Implementation not yet started._

---

## 1. Why this exists

Today the system has three roles — `admin | technician | operator` — but in code
**technician and operator are byte-for-byte identical.** Every place that cares
about them treats `{technician, operator}` as one bucket (`assign_alert`,
`assign_work_order`, list-scoping). The only real privilege boundary is
**admin vs not-admin**. This plan gives the two worker roles distinct, coherent
identities grounded in how maintenance-management (CMMS/EAM) systems actually
work.

---

## 2. Domain grounding (CMMS / PdM norms)

Standard maintenance software converges on:

- **Personas:** Requester → Technician → Planner/Supervisor → Administrator (+ View-Only).
- **A gated work-order lifecycle:** *Request → Create → Approve → Assign → In Progress → Complete → Close*, each transition done by the right person, in sequence, with a permanent record.
- **Separation of duties:** the requester shouldn't approve; the doer shouldn't be the sole closer.
- **Least privilege:** each role gets the minimum it needs.
- **PdM twist:** in condition-monitoring systems *the sensors are the requester* — work orders are auto-generated when the model detects a developing problem. AuGuard's `decision_service` already does exactly this, so **humans start at triage, not at request.**

Sources: clickmaint, LLumin, Keep Wisely, oxmaint, Accruent (CMMS roles & work-order workflow).

---

## 3. The three roles, mapped to AuGuard

| Role | CMMS equivalent | Identity in one line |
|------|-----------------|----------------------|
| **Operator** | Requester + Equipment Operator + View-Only | **Eyes on the equipment.** Read-only monitor — watches live health, never runs the maintenance workflow. |
| **Technician** | Maintenance Technician (executor) | **Hands on the equipment.** Triages alerts, executes assigned work orders, logs what was done + parts used. |
| **Admin** | Planner + Supervisor + Administrator | **Runs the operation.** Creates/assigns/escalates work, manages users, assets, inventory, notifications. |
| _`auguard-ai`_ | The condition-monitoring "requester" | System actor. Auto-creates alerts + HIGH/CRITICAL work orders. No human can manufacture an AI alert. |

### Locked decisions
1. **Operators are never assignable** to work orders (or alerts). Repairs are technician work.
2. **Operators cannot touch alerts at all** — no acknowledge, no resolve. Pure read-only monitor. (⟹ alert triage now belongs to the **technician**.)
3. **Self-report closure** (no separation-of-duties gate). Technician completes the work order and the reported outcome is final — it counts toward the AI precision KPI immediately. The "verified/two-step" model is noted as a future extension only.

---

## 4. The workflow, stage by stage (with the rule at each gate)

**Stage 0 — Identity.** Everyone logs in carrying a role; role is read fresh from
the DB on every request (already true). Least privilege from here down.

**Stage 1 — Detection (no human).** ML fires an alert; HIGH/CRITICAL auto-spawns
an OPEN work order. Author = `auguard-ai`. Humans never create AI alerts; manual
alert/WO creation is **admin-only**.

**Stage 2 — Triage.** The **technician** (or admin) **acknowledges** the alert
(`NEW → ACKNOWLEDGED`): "seen, it's real." Operators only *watch* (live Dashboard).

**Stage 3 — Planning & assignment.** **Admin** (as planner) assigns the work order
to a **technician** and sets priority/due date. This is the human approval gate
on the AI's auto-job. *Assignment target must be a technician.*

**Stage 4 — Execution.** The **assigned technician** advances the work order
(`open → in_progress`) and does the physical work. Only the assignee or an admin
may move it.

**Stage 5 — Completion + feedback.** The technician completes via the atomic
`POST /work-orders/{id}/complete`: writes a **maintenance record** (action +
**outcome**) and **consumes parts** (stock decrements). The outcome
(`failure_confirmed` = AI true positive, `no_fault_found` = false positive) grades
the AI precision KPI. The technician then **resolves** the alert
(`ACKNOWLEDGED → RESOLVED`).

**Stage 6 — Closure.** Self-report (decision 3): completion is final; KPI counts
immediately. _(Future option: admin verify/close gate.)_

**Stage 7 — Oversight.** Admin reviews KPIs (precision, MTTR), manages
**inventory** (restock), **users**, **equipment/sensors/FMEA**, and sends
**notifications**. Everyone *views* reports/dashboards; only admin *changes*
config/inventory/users.

---

## 5. Target permissions matrix

✅ allowed · 👁 view-only · ❌ denied

| Capability | Operator | Technician | Admin |
|------------|:--------:|:----------:|:-----:|
| View live Dashboard / Fleet / Reports | ✅ | ✅ | ✅ |
| View inventory (stock levels) | 👁 | 👁 | ✅ |
| **Acknowledge** alert (NEW→ACK) | ❌ | ✅ (assigned) | ✅ |
| **Resolve** alert (ACK→RESOLVED) | ❌ | ✅ (assigned) | ✅ |
| Be **assigned** an alert / work order | ❌ | ✅ | — |
| Advance WO status (→ in_progress) | ❌ | ✅ (own) | ✅ |
| **Complete** WO + log maintenance + outcome | ❌ | ✅ (own) | ✅ |
| Log a standalone maintenance record | ❌ | ✅ | ✅ |
| Consume parts on completion | ❌ | ✅ | ✅ |
| Create alert / WO manually, **assign**, escalate | ❌ | ❌ | ✅ |
| Restock / manage inventory | ❌ | ❌ | ✅ |
| Manage users / equipment / sensors / FMEA | ❌ | ❌ | ✅ |
| Send notifications | ❌ | ❌ | ✅ |

### Operator visibility model (sub-decision — RESOLVED)
**Decision: operators see all alerts, read-only.** Operators monitor through the
**live Dashboard** plus **Fleet/Asset**, **Reports**, read-only inventory — and
now the **Alerts page read-only** (they view every alert but cannot
acknowledge/resolve/assign/escalate). Implemented:
- Backend: `GET /alerts` list → admin **+ operator** get `list_all_alerts`;
  technician keeps the assigned-only queue. `GET /alerts/{id}` → only **technician**
  is restricted to own; admin + operator view any.
- Frontend: acknowledge/resolve buttons gated to **technician** (`isTech`), not
  `!isAdmin`, so operators get a read-only Alerts view.

**Work Orders page hidden from operators (2026-06-21).** Operators no longer see
the Work Orders page at all: the nav tab is hidden for `operator` and `/work-orders`
is wrapped in a `RequireStaff` guard (redirects operators to the dashboard).
Frontend-only — backend read scope unchanged, so operators' Asset Detail view
(which lists an asset's work orders) still works. _Note: that Asset Detail
work-orders section is still visible to operators; not changed._

**Maintenance — same model as alerts.** Read scope mirrors the alerts rule:
**admin + operator see all** (operator read-only monitor); **technician sees only
their own** (performed records). _(Work orders previously matched this too, before
the page was hidden from operators above.)_
Implemented:
- Backend: `list_work_orders` filters to `assigned_to == user` **only for
  technician**; `list_maintenance_records` filters to `performed_by == user`
  **only for technician**; admin + operator get the full list. Both `GET /{id}`
  detail routes restrict **only technician** to own; admin + operator view any.
- Frontend (Work Orders): Start / Complete buttons gated to `canAct =
  isAdmin || (isTech && assigned_to_username === username)` — operators read-only,
  technicians act only on their own; assign dropdown filtered to technicians.
- Maintenance page was already read-only (only admin-gated Restock); no FE change.

Actions stay restricted at the service layer (assignee/role), so operator read
access never widens write access. _Note: a technician's WO/maintenance list is
empty until an admin assigns work to them — that is the intended queue behavior._

---

## 6. Build plan (file-by-file, additive)

> **Progress (2026-06-21):** B1, B2, B3 done. Operator-read-scope widening done
> (`GET /alerts` list + detail → operators read all; technicians keep assigned
> queue). Frontend Alerts page done: assign dropdown filtered to technicians,
> assign errors now surfaced (no more silent `catch {}`), ack/resolve buttons
> gated to `isTech`. Work Orders + Maintenance use the same read model as alerts
> (admin + operator see all; technician sees only own; assign dropdowns
> technician-only). **Remaining:** B4/B5 (explicit role gates on status routes),
> F1 nav gating.

### Backend — the real rule changes

| # | File / function | Change | Reason |
|---|-----------------|--------|--------|
| B1 | `app/services/work_order_service.py` → `assign_work_order` | `allowed_roles = {TECHNICIAN, OPERATOR}` → **`{TECHNICIAN}`** | Decision 1: operators never assignable. |
| B2 | `app/services/alert_service.py` → `assign_alert` | `allowed_roles = {TECHNICIAN, OPERATOR}` → **`{TECHNICIAN}`** | Decision 2: alerts only go to technicians. |
| B3 | `app/api/routes/maintenance_records.py` → `POST /` (`create`) | `Depends(get_current_user)` → **`Depends(require_role(TECHNICIAN, ADMIN))`** | **Closes a real hole** — today any auth user (incl. operator) can log a record. |

### Backend — defense-in-depth (recommended, makes intent explicit)
These are belt-and-suspenders: operators are *already* blocked implicitly because
they can never be an assignee, but an explicit role gate documents intent and
guards against future assignment changes.

| # | File / route | Change |
|---|--------------|--------|
| B4 | `app/api/routes/alerts.py` → `PUT /{id}/status` | add `Depends(require_role(TECHNICIAN, ADMIN))` |
| B5 | `app/api/routes/work_orders.py` → `PUT /{id}/status` + `POST /{id}/complete` | add `Depends(require_role(TECHNICIAN, ADMIN))` |

> Service-level ownership checks (`update_alert_status` assignee-only;
> `update_status` admin-or-assignee) stay as-is — they remain the fine-grained
> "is this *your* task" layer beneath the coarse role gate.

### Frontend
| # | File | Change |
|---|------|--------|
| F1 | `frontend/src/components/Topbar.jsx` | Hide **Alerts / Work Orders / Maintenance** tabs for `operator`; keep Dashboard / Fleet / Reports (+ read-only Inventory). |
| F2 | Alert / WorkOrder / Maintenance pages | Gate action buttons (acknowledge, resolve, advance, complete, log) so they never render for `operator`. (Operators shouldn't see dead buttons.) |
| F3 | Assignment dropdowns (assign alert / WO) | Populate from **technicians only** (operators no longer valid targets). |

### No change required
- `dependencies.py` (`get_current_user`, `require_role`) — primitives are fine as-is.
- Admin-only creation/assignment/escalation routes — already correct.
- Inventory / users / equipment / sensors / FMEA write gates — already admin-only.
- Role-scoped list services — behavior already correct for the new model.
- **ML inference layer — untouched.**

---

## 7. Guardrails
1. Additive-only; no destructive migrations (roles enum unchanged — still
   `admin | technician | operator`).
2. ML pipeline / `FEATURE_COLS` / inference engine never touched.
3. Backend is the source of truth for authorization; frontend gating is UX only
   (hiding tabs/buttons is **not** a security boundary — B1–B5 enforce it).
4. Verify after each step (seed users `admin/tech/op`, exercise each role).

---

## 8. Test checklist (post-build)
Verified live 2026-06-21 via `scripts/verify_rbac.py` (14/14 checks pass against
the running backend):
- [x] Operator: cannot be assigned an alert or WO (400 on assign attempt).
- [x] Operator: `PUT /alerts/{id}/status` → 403 (not the assignee).
- [x] Operator: `POST /maintenance-records` → 403.
- [x] Operator: sees ALL alerts / WOs / maintenance records (read-only, == admin counts).
- [x] Technician: sees only own; receives an assigned alert, acknowledges it (200), logs a record (201).
- [x] Admin: assign alert + WO to technician → 200.
- [ ] Operator UI: action buttons hidden (Alerts ack/resolve, WO start/complete) — covered in code (`isTech`/`canAct`); confirm visually.
- [ ] AI auto-spawn (HIGH/CRITICAL) still creates alert + WO as `auguard-ai`.

> Reusable: `scripts/verify_rbac.py` (logs in as admin/technician/operator and
> asserts the matrix). Note: it creates a couple of `rbac-verify` maintenance
> records + assigns/acks one alert as test data.

---

_Created 2026-06-21. Update when rules change._
