# Cardinal — Eligibility Scoring Engine Spec (Demo / Hackathon)

**Purpose:** deterministic, fully explainable logic behind the Home Eligibility Score.
LLM extracts the packet → this engine scores it. The engine is pure functions, no API calls,
no randomness. Every point added or deducted emits a record the UI renders as the "why" panel.

**Scope:** CHF only (per `07-mvp-and-roadmap.md`). Thresholds are ILLUSTRATIVE for demo purposes,
not clinical guidance (per disclaimer in `02-clinical-scope.md`). Say this if asked.

---

## 1. Pipeline position

```
packet (md/txt) → Claude extraction → PatientRecord JSON → scoreEligibility() → ScoreResult → UI
                                                          → assessTrend()     → TierResult  → dashboard
```

Engine = two pure functions. Build as a standalone module with unit tests; UI imports it.

---

## 2. Input schema — `PatientRecord`

This is also the JSON schema to give Claude for extraction (use tool-use / forced JSON).
All fields nullable — missing data is handled by the confidence model (§7), never by guessing.

```json
{
  "name": "string",
  "age": 0,
  "mrn": "string",
  "condition": "CHF",
  "vitals": {
    "hr_bpm": 0,
    "bp_systolic": 0,
    "bp_diastolic": 0,
    "spo2_pct": 0,
    "resp_rate": 0,
    "temp_c": 0.0,
    "weight_lb": 0.0,
    "weight_delta_72h_lb": 0.0
  },
  "symptoms": {
    "dyspnea": "none | exertional | at_rest",
    "edema": "none | stable | worsening",
    "chest_pain": false
  },
  "devices_available": ["scale", "bp_cuff", "pulse_ox", "ecg_patch"],
  "home": {
    "caregiver": "none | part_time | full_time",
    "housing_stable": true,
    "has_power_refrigeration": true,
    "connectivity": "none | cell_only | wifi",
    "med_self_admin": "yes | assisted | no",
    "fall_risk": "low | moderate | high"
  }
}
```

---

## 3. Red flags — checked FIRST, before any scoring

If ANY is true → band is **Admit**, score still computed and shown, reason = the flag.
This is the "conservative by design" requirement from `06-risks-and-compliance.md`.

| Flag | Condition |
|---|---|
| `RF1` | `spo2_pct < 92` |
| `RF2` | `bp_systolic < 90` |
| `RF3` | `dyspnea == "at_rest"` |
| `RF4` | `chest_pain == true` |
| `RF5` | `hr_bpm < 45 or hr_bpm > 130` |
| `RF6` | `weight_delta_72h_lb >= 5` |

---

## 4. Gate A — Clinical stability (weight 0.50)

Each signal → status `in | borderline | out` → points `100 | 60 | 0`.
Gate A score = weighted average of signal points.

| Signal | Weight | In-range | Borderline | Out |
|---|---|---|---|---|
| `spo2_pct` | 0.20 | ≥ 94 | 92–93 | < 92 (also RF1) |
| `weight_delta_72h_lb` | 0.20 | < 2 | 2–4 | > 4 |
| `hr_bpm` | 0.15 | 50–100 | 101–110 or 45–49 | > 110 or < 45 |
| `bp_systolic` | 0.15 | 90–160 | 161–180 | > 180 or < 90 |
| `symptoms` (worst of) | 0.15 | dyspnea none AND edema ≤ stable | dyspnea exertional OR edema worsening | dyspnea at_rest |
| `resp_rate` | 0.10 | ≤ 20 | 21–24 | > 24 |
| `temp_c` | 0.05 | < 38.0 | 38.0–38.5 | > 38.5 |

## 5. Gate B — Monitoring feasibility (weight 0.20)

CHF required devices: `scale`, `pulse_ox`, `bp_cuff`. Optional: `ecg_patch`.

- Start at 100
- Each missing **required** device: −40 (and if any required missing entirely → gate fails, see §6 caps)
- Missing optional device: −10
- If a required device is "deliverable today" (demo nuance, optional field): −15 instead of −40

## 6. Gate C — Home & social readiness (weight 0.30)

Checklist, start at 100:

| Item | Deduction |
|---|---|
| `caregiver`: full_time 0 · part_time −15 · none −40 |
| `housing_stable == false` | −30 |
| `has_power_refrigeration == false` | −25 |
| `connectivity`: wifi 0 · cell_only −8 · none −35 |
| `med_self_admin`: yes 0 · assisted −10 · no −25 |
| `fall_risk`: low 0 · moderate −6 · high −25 |

Floor at 0.

### Overall score & bands

```
overall = round(0.50*A + 0.20*B + 0.30*C)
```

| Band | Rule |
|---|---|
| **Eligible** | overall ≥ 80 AND every gate ≥ 70 AND no red flags |
| **Watch** | overall 60–79, OR any gate 50–69 (whichever is reached first), no red flags |
| **Admit** | overall < 60, OR any gate < 50, OR any red flag |

Weakest-link caps are the point: a 95 on Gate A never rescues a failed Gate C.
"Watch" in UI = eligible *with conditions* (nurse-visit cadence, tighter monitoring).

## 7. Confidence

```
completeness = required_fields_present / required_fields_total   (the §2 schema, ~20 fields)
high ≥ 0.90 · medium 0.70–0.89 · low < 0.70
```

**Rule: confidence == low caps the band at Watch** (never Eligible on thin data — say this on stage).
UI confidence expander shows: completeness %, plus static demo values for "model certainty"
and "case similarity n" (per `08-design.md` §5.2 — label them simulated internally).

## 8. Output schema — `ScoreResult` (this drives the entire UI)

```json
{
  "overall": 86,
  "band": "eligible",
  "red_flags": [],
  "confidence": { "level": "high", "completeness": 0.95 },
  "gates": [
    {
      "id": "A", "label": "Clinical stability", "score": 86, "status": "pass",
      "contributions": [
        { "field": "weight_delta_72h_lb", "value": 2.4, "status": "borderline",
          "points": 60, "weight": 0.20,
          "note": "Weight up 2.4 lb over 72h — early fluid signal, within home-manageable range" }
      ]
    }
  ],
  "dominant_signal": "weight_delta_72h_lb",
  "rationale": "string — assembled from templates, see §9"
}
```

`contributions` = one record per signal/checklist item, ALWAYS emitted (in-range ones too).
`dominant_signal` = largest weighted deduction. The "why" panel and gate expanders render
ONLY from this object — no separate copywriting that can drift from the logic.

## 9. Rationale templates (plain English, assembled not generated)

- Eligible: `"{name} clears all three gates. {dominant_note}. Recommend home management{cadence}."`
- Watch: `"{name} is home-manageable with conditions: {weak_gate_label} scored {score}. {dominant_note}. Recommend home + {mitigation}."`
- Admit: `"{name} does not clear {failed_gate_label}{red_flag_clause}. Recommend admission."`

Keep templates in the engine module so rationale is testable.

---

## 10. Worked example — Mrs. R (MUST reproduce: **86 / Eligible**)

Input: HR 78 · BP 132/84 · SpO₂ 95 · RR 18 · Temp 37.1 · weight +2.4 lb/72h ·
dyspnea exertional · edema stable · devices: scale, bp_cuff, pulse_ox (no ecg_patch) ·
caregiver full_time (daughter) · housing ✓ power ✓ wifi ✓ · meds assisted · fall risk moderate.

- Gate A: weight borderline (0.20×60=12) + symptoms borderline (0.15×60=9) + rest in-range (0.65×100=65) → **86**
- Gate B: optional ecg_patch missing → 100−10 → **90**
- Gate C: meds assisted −10, fall moderate −6 → **84**
- Overall: 0.5×86 + 0.2×90 + 0.3×84 = 43 + 18 + 25.2 = **86 → Eligible** (all gates ≥70, no flags)

## 11. Test cases (build all three packets; switching between them replaces "live sliders")

| Case | Key inputs | Expected |
|---|---|---|
| 1. Mrs. R (above) | — | **86 / Eligible** |
| 2. Mr. D | SpO₂ 93, weight +3.1 lb, HR 104, caregiver part_time, connectivity cell_only | Gate A ≈ 67 → **Watch** (gate 50–69 rule) |
| 3. Ms. K | SpO₂ 91 → RF1, plus caregiver none | **Admit** (red flag; Gate C also < 50) |

Unit-test these three end-to-end (packet → extraction-shaped JSON → expected band).

## 12. Monitoring trend logic — `assessTrend()` (dashboard vignette)

Baseline = mean of days 1–2 per signal. Then per day:

| Tier | Rule |
|---|---|
| 🔴 Red | any red flag from §3 on today's values, OR weight ≥ +5 lb vs baseline |
| 🟡 Yellow | **trend composite:** weight ≥ +3 lb vs baseline AND (SpO₂ ≤ baseline −2 OR HR ≥ baseline +10) — even if every absolute value is still in-range |
| 🟢 Green | otherwise |

Scripted 5-day series for Mrs. R (canned data, "advance day" button):

| Day | Weight | SpO₂ | HR | Tier |
|---|---|---|---|---|
| 1 | 148.0 | 95 | 78 | baseline |
| 2 | 148.2 | 95 | 77 | baseline → 🟢 |
| 3 | 149.5 | 94 | 82 | 🟢 |
| 4 | 151.4 | 93 | 89 | **🟡** (Δw +3.3, SpO₂ −2, HR +11) |
| 5 (post-intervention) | 150.1 | 94 | 83 | 🟢 |

Yellow fires on day 4 while every single value is still individually unalarming — that IS the
demo moment. Caption it: "no threshold alarm would have fired yet."

## 13. Engine API

```ts
scoreEligibility(record: PatientRecord): ScoreResult       // pure, synchronous
assessTrend(baselineDays: Reading[], today: Reading): TierResult
```

Single module (`scoring.ts` / `scoring.py`), zero dependencies, unit tests for §10–§12.
UI never computes clinically — it only renders `ScoreResult`/`TierResult`.

## 14. Q&A insurance (why this design)

- "Why 86?" → walk the §10 arithmetic live from the contributions panel.
- "What if data is missing?" → confidence cap, never Eligible on thin data (§7).
- "Could it send a sick patient home?" → red flags short-circuit everything (§3); weakest-gate caps (§6); physician decides.
- "Is the AI deciding?" → AI only reads the packet; scoring is deterministic and inspectable.
