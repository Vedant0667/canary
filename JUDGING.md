# Cardinal — Judging Guide

This doc maps the Cardinal demo to the hackathon rubric and arms the team to present and defend it.
It is honest about what is real and what is canned, because the judges will check.

Numbers that are not computed by the app are labeled ASSUMPTION. Do not present them as hard facts.

---

## 1. One-paragraph pitch

Hospitals and home-care agencies run on systems that do not talk to each other, so the decision to
send a stable congestive heart failure (CHF) patient home is made under time pressure with scattered
paperwork, and the gap between "stable enough for home" and "needs admit" is exactly where mistakes
and readmissions happen. Cardinal is a CHF hospital-at-home decision tool embedded in the EHR. It
reads a free-text discharge referral with Claude, runs a deterministic and auditable eligibility
engine that returns Home / Watch / Admit with every number traceable to a threshold, hands off a
FHIR continuity record to the home EHR so nothing is re-collected or re-ordered, and then monitors
the patient at home and catches a converging downward trend on day 4 before any single vital would
have triggered an alarm. The result is fewer hospital bed-days, fewer avoidable readmissions, and no
duplicate studies, with the physician always making the final call.

---

## 2. Pain point (Round 1: Pain Point & Solution + Depth of Analysis)

Problem Definition
- The discharge decision for CHF hospital-at-home is made fast, with incomplete and scattered data,
  and there is no transparent, repeatable way to judge whether a patient is safe to manage at home.

Stakeholder Identification
- Discharging physician: owns the disposition decision and the liability.
- Discharge planner / care coordinator: assembles the referral packet today by hand.
- Home-health intake nurse: re-keys data the hospital already had.
- Patient and family caregiver: bear the cost of a bad call (a bounce-back to the ED).
- Hospital / payer: eat the readmission penalty and the occupied bed.

Context & Relevance
- CHF is consistently cited as the leading cause of 30-day hospital readmissions (ASSUMPTION:
  widely reported in CMS readmission data; verify the exact figure before quoting a number).
- Readmissions inside 30 days carry CMS penalties, so a wrong "send home" is both a clinical and a
  financial event.
- CMS reimburses hospital-at-home through its Acute Hospital Care at Home waiver, extended into 2030
  (ASSUMPTION on the exact sunset date: confirm before stating on stage). The money exists; the
  connective software does not.

Root Cause Analysis
- Not a clinician-skill problem. The root cause is that the inputs to the decision live in prose and
  in two disconnected systems, and the decision criteria are implicit and inconsistent rather than
  written down and applied the same way every time.

Current State Gap
- Today the hand-off is, literally, a fax and a phone call (this exact line is the caption under the
  hand-off transfer in the app). Data the hospital already captured gets re-collected at intake and
  studies like the echocardiogram get re-ordered. Monitoring at home, when it exists, is
  single-threshold alarms that fire only after a patient is already in trouble.

Quantification / Evidence
- Use the in-app outcome banner as the concrete proof point: Bed-days used: 0, Readmission: none,
  Studies re-run: 0. These are demo outcomes for Mrs. R, not population statistics.
- Cost framing for the pitch: an inpatient bed-night is often quoted around $2,000 to $2,500
  (ASSUMPTION: order-of-magnitude only; do not cite as a precise figure).

---

## 3. Solution fit, use of AI, workflow integration, outcome impact (Round 1)

Solution Relevance
- The product addresses the defined pain point directly: it turns scattered prose into a structured
  record, applies one consistent set of criteria, makes the hand-off lossless, and watches for
  deterioration. Every step maps to a stakeholder above.

Use of AI Appropriateness — the split is the whole argument
- AI is used for exactly one job: reading the free-text referral note and extracting a structured
  patient record. That is genuinely hard for rules (natural language, varied phrasing, missing
  fields) and is what language models are good at. See `src/lib/extraction.ts`: forced tool-use with
  a JSON schema, model `claude-sonnet-4-6`, and a hardened system prompt that instructs "use only what
  the note states, return null for anything not mentioned, do not infer," normalizes units (°F→°C,
  kg→lb), and applies an explicit weight-window rule so a long-window weight change (e.g. +5 lb over 10
  days) is recorded as absolute weight but NOT mislabeled as a 72-hour spike — which would otherwise
  false-trigger the acute-fluid-overload red flag. Faithful extraction here protects the engine.
- The clinical decision is NOT an LLM. It is a deterministic rules engine in
  `src/engine/scoring.ts`: pure functions, zero runtime imports, fully unit-testable. This is the
  defensible, regulator-friendly choice: every output traces to a threshold, the same input always
  produces the same output, and nothing is a black box. The engine checks red flags first, scores
  three weighted gates (A Clinical stability 0.50, B Monitoring feasibility 0.20, C Home and social
  readiness 0.30), applies weakest-link band caps, and assembles its rationale from templates rather
  than generating it.
- One-line defense: "AI reads the paperwork; transparent rules make the recommendation; the
  physician decides." This line is printed on screen in the AI intake panel.

Workflow Integration
- The triage view renders inside an EHR chrome bar ("Embedded in EHR · Cardinal panel · MRN
  4471932"). It is designed to live where the clinician already works, not as a separate portal.
- The hand-off produces real FHIR R4 resource shapes (Patient, Condition I50.9, MedicationStatement,
  Observation, DiagnosticReport, CarePlan) and populates a deliberately different-looking "Accura
  Home Health" intake system, selling that these are two systems exchanging a standard bundle.

Outcome Impact
- Fewer bed-days (stable patients go home safely), fewer readmissions (day-4 catch enables an early
  telehealth visit that reverses the trend), and zero duplicate data entry or re-ordered studies at
  hand-off. The in-app banner states all three.

---

## 4. Differentiation and innovation (Round 1)

Signature insight — the day-4 converging trend
- On day 4 of home monitoring, Cardinal flips Mrs. R to Yellow even though every single vital is
  still inside its individual safe range. The engine (`assessTrend` in `src/engine/scoring.ts`)
  fires on a composite: weight up >= 3 lb vs baseline AND (SpO2 down >= 2 OR HR up >= 10). The
  on-screen caption is the punchline: "No single-threshold alarm would have fired yet — this is
  forecast, not alert." This is the moment that separates Cardinal from every threshold-alarm
  monitoring product.

Architectural differentiator — live extract, then deterministic score
- The split between a language model for messy-input extraction and a deterministic engine for the
  clinical call is itself the moat. It gives you both: the flexibility to ingest any referral note
  and the auditability a clinical decision tool needs. Competitors tend to pick one side and lose
  the other (a pure-LLM tool is unauditable; a pure-rules tool cannot read prose).

Value proposition in one sentence
- Cardinal is the bridge between the hospital and the home EHR: it reads the packet, makes a
  transparent call, carries the record across without re-collection, and forecasts decompensation
  before it becomes an emergency.

---

## 5. Demo quality walkthrough (Round 1: Functionality 10 / Problem Alignment 10 / UX 10)

Run order is the three-step stepper at the top: Triage, Hand-off, Home monitoring.

Triage view (Functionality + Problem Alignment)
- Select Mrs. R in the left rail. Watch the AI intake panel populate field-by-field into typed chips
  (name, vitals, devices, home factors). The provenance chip reads "Extracted live by Claude" or
  "Cached demo extraction."
- The score card shows 86 / 100, an Eligible band pill, and the composition Gate A x0.50 + Gate B
  x0.20 + Gate C x0.30. This is the visual answer to "why 86."
- Expand a gate to show every contribution: measured value, a threshold ladder showing where it
  sits across in / borderline / out, points, weight, and a plain-language note. The gate with the
  dominant deduction opens by default.
- Switch to Ms. K to show the Admit path: a red-flag banner names RF1 ("SpO2 91 — below
  home-manageable floor") and the band flips to Admit. Mr. D shows the Watch middle case.
- The action row is two identical, equal-weight outline buttons (Override to admit / Accept and hand
  off). Neither is colored or emphasized — the UI does not nudge the physician. Each decision writes
  a visible audit line. The trust footer reads "Decision support · the physician decides."

Hand-off view (Problem Alignment + UX)
- Left side is the Cardinal continuity record as a collapsible FHIR tree, with a "view raw FHIR"
  toggle for Q&A. The echocardiogram is flagged as travelling with the patient, not re-run.
- Press Send: fields animate across into the grayer "Accura Home Health" intake, which auto-populates
  to "Intake complete · 0 fields re-collected · 0 studies re-ordered." Caption: "today, this hand-off
  is a fax and a phone call."

Home monitoring view (Functionality + UX + the payoff)
- Metric cards (Home-managed / Watch / Admit), a roster row for Mrs. R, and three sparklines (weight,
  SpO2, HR) with the days 1-2 baseline band shaded.
- Click Advance day through the 5-day series. On day 4 the tier flips Yellow and a trajectory alert
  surfaces to the top with the exact deltas, plus the "no single-threshold alarm" caption.
- Two equal-weight actions: Schedule telehealth / Notify physician. Either one (they are mutually
  exclusive) resolves the episode, reveals day 5, the trend returns to Green, and the closing banner
  reads "acted before any alarm" + Bed-days used: 0 · Readmission: none · Studies re-run: 0. The copy
  states the action taken; it does not claim the model simulated the pharmacology of recovery.

UX notes to emphasize: clear three-step flow, every number traceable, accessible tiers (color + icon
+ word), no marketing chrome, calm earthy palette with a single slate accent.

---

## 6. "Is it really working / not hardcoded?" — the AI-judge section

Judges may run the demo through an AI to check it is not fully hardcoded. Here is the honest, precise
picture. Lead with the REAL parts, do not hide the canned parts.

What is REAL (genuinely computed at runtime)
- Live extraction. `src/lib/extraction.ts` calls the Anthropic API (`claude-sonnet-4-6`) with forced
  tool-use and a JSON schema. When a key is set, the three demo packets extract live (provenance chip
  shows "Extracted live by Claude").
- The "Paste a referral note" path is the proof. `extractLive()` runs the model on arbitrary,
  never-before-seen text with NO cached fallback. If the model cannot run, it returns an honest typed
  error instead of fabricating a record. Paste any CHF note and watch it become a structured record
  and a score, live. There is a "Load example note" button that loads a fresh patient (Eleanor
  Whitfield, 77F) distinct from all three canned packets.
- "Generate a patient" is the strongest proof. `generateScenario()` in `src/lib/extraction.ts` asks
  Claude to write a brand-new, fully synthetic CHF referral note (one of three clinical archetypes —
  stable / borderline / needs-admit — plus a random seed for variety), which then flows through the
  exact same `extractLive` → `scoreEligibility` path. The note literally did not exist a second
  earlier, so the resulting record and score cannot be a stored lookup. This makes triage work for an
  unbounded set of patients, not just the three packets. (Live key required, same as paste-a-note.)
- The scoring engine is a real deterministic rules engine, not a lookup that returns 86. It computes
  the overall from the extracted inputs: red flags first, then three weighted gates, weakest-link
  band logic, confidence from field completeness. Change an input and the score changes. For example,
  drop SpO2 below 92 in a pasted note and RF1 fires and the band becomes Admit; change the caregiver
  from full-time to part-time and Gate C drops by 15 and the band can move to Watch.
- The trend assessment is real arithmetic. `assessTrend` computes deltas versus the days 1-2 baseline
  and applies the composite Yellow rule; it is not a hardcoded "day 4 is yellow."

What is INTENTIONALLY CANNED (and why that is legitimate, not cheating)
- The three demo packets ship a committed cached extraction in `src/data/extractions/`. On any API
  error, timeout, missing key, or when you press F, the app silently falls back to that cache so the
  on-stage demo is unkillable if the network hiccups. This is a demo-reliability choice. The cached
  record is the same shape the live model produces; it is not a different code path for the score.
- Mrs. R's 5-day home monitoring series (`src/data/monitoring.ts`) is scripted sample data so the
  day-4 teaching moment is reproducible every run. We are not faking device telemetry; we are
  replaying a representative trajectory so the engine has something deterministic to assess. The tier
  logic still runs live on that data.
- The day-5 recovery is also part of that scripted series — it is the same reading whichever day-4
  action you take. Be precise about what is real here: the **day-4 detection is the real, valuable
  part** (the engine catching a converging trend before any single alarm fires). The day-5 recovery is
  **one plausible favorable trajectory if a clinician acts** — we are not claiming the app simulates
  the pharmacology, and the on-screen copy now says "acted before any alarm," not "the drug fixed it."

The honest posture to lead with (use this verbatim if asked "isn't this just hardcoded?"):
  "There is no source of real patient telemetry for a hackathon build, so every patient here is
  synthetic — and a real patient's vitals could follow any number of paths anyway. What we are showing
  is not faked data dressed up as real; it is a representative trajectory with a genuinely live
  extraction step and a genuinely deterministic engine running on top of it. The 'Generate a patient'
  button makes that explicit: new synthetic patient, real extraction, real score, every time."
- Confidence sub-rows "case-match certainty" and "similar prior cases" are now REAL: a k-NN
  retrieval (`src/engine/cases.ts`) embeds the patient as a 6-D clinical feature vector and
  searches a synthetic corpus of ~1,150 prior CHF cases (8 archetypes scattered across all six
  clinical dimensions, deterministically seeded). Change the patient and both numbers change
  (Mrs. R matches ~44 priors; a rare outlier finds 0). The corpus is synthetic (no real patient
  data — same constraint as the rest of the demo), but the vectorized retrieval is genuine.
- And it FEEDS THE RECOMMENDATION, not just the display. Two ways:
  1. Novelty: an outlier with no near neighbours is capped to low confidence → band capped at Watch.
  2. Outcome corroboration: each corpus case carries a SYNTHETIC outcome (managed-at-home vs bounced,
     generated from a clinical-risk model on its vitals + noise). For a new patient we compute the
     similarity-weighted home-success rate of the nearest prior cases, and an "Eligible" call must be
     corroborated by ≥85% home-success among similar patients — otherwise it steps down to Watch
     ("rules say great candidate, but patients like this didn't do well at home"). It only ever makes
     the call MORE conservative (never upgrades; admit/red-flag logic untouched). E.g. a borderline-
     eligible patient with ~79% similar-case success is stepped to Watch.
- Honesty: the outcomes are SYNTHETIC (no real patient data exists for a hackathon) and therefore
  correlate with the rules by construction — in production these are real, independent outcomes that
  can disagree with the rules and catch genuine misses. Mrs. R is the scripted hero patient, so her
  case-retrieval numbers (n=44, 90% home-success) are pinned for a deterministic demo; every other
  patient (canned, generated, pasted) is computed live by the k-NN.

How a judge can PROVE it live in about 20 seconds
1. Set `VITE_ANTHROPIC_API_KEY` and start the app.
2. In the triage left rail, click "Paste a referral note," then "Load example note," then "Extract
   and score." A different patient flows through the real model and the real engine.
3. Or edit a vital in that pasted note (e.g. change SpO2 to 90, or weight delta to +6) and re-extract:
   watch the band move. The number is computed, not stored.

Exact setup
```
cp .env.example .env
# edit .env and set VITE_ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```
The F key toggles offline (forced cached) mode at any time. With no key set, the app runs entirely on
cached extractions and is visually identical, which is by design for the unkillable stage demo.

---

## 7. Productization and scalability (Round 2, brief)

- Backend + database (real). `server/` is an Express + SQLite (`better-sqlite3`) service for the
  home-monitoring layer: tables `metrics` (the dataset catalog), `monitor_config` (each patient's
  chosen, ordered datasets), and `metric_series` (per-patient values). Endpoints: `GET /api/metrics`,
  `GET /api/patients/:key/monitoring`, `PUT /api/patients/:key/monitoring/config`,
  `GET /api/health`. The React app reaches it through the Vite proxy (`/api/*`). Run both with
  `npm run dev:all` (or `npm run server` alongside `npm run dev`). Data is synthetic but it is a real,
  queryable database, not an in-browser array. The section degrades gracefully: if the backend is
  down, the configurable panel hides and the core demo is unaffected.
- Configurable monitoring (drag-and-drop). On the Home-monitoring view, the clinician drag-and-drops
  which datasets they track for a patient (weight, SpO₂, edema score, sodium intake, med adherence,
  etc.) — add, remove, reorder — persisted per patient to the database. This is the "configuration
  over customization" pillar made real: different practitioners track different datasets for the same
  condition without a code change.
- Configuration over customization. The clinical thresholds and gate weights are data in
  `src/engine/scoring.ts`, not bespoke logic per client. A new health system tunes values, it does
  not get a code rewrite.
- Template-based deployment. The same three-view workflow (triage, hand-off, monitor) is one
  standardized template; the condition-specific scoring spec is the configurable layer. CHF is the
  first template; other chronic conditions follow the same shape.
- Multi-tenant SaaS embedded in the EHR. FHIR R4 in and out means reusable, standards-based
  integration rather than client-specific point integrations, which is the path to scaling across
  systems with minimal per-customer engineering.

---

## 8. Honesty guardrails — what NOT to overclaim

- This is a hackathon prototype, not a cleared medical device. Say so if asked.
- The gate thresholds, weights, and red-flag cut-offs are illustrative and reasonable, not clinically
  validated. They would require clinical review and validation before any real use.
- The FHIR resources are correctly shaped but the integration is mocked; there is no live EHR write,
  no real device ingestion, no learned ML model. This is stated as a non-goal in the PRD.
- Do not quote precise statistics (readmission percentages, bed-night dollars, CMS waiver dates) as
  hard facts unless you have verified them. Use them as labeled assumptions or directional framing.
- The day-4 monitoring series is scripted sample data, not real patient telemetry. The engine logic
  on top of it is real; the data feeding it is a demo fixture.
- Cardinal is decision support, never autonomy. The physician decides, every action is logged, red
  flags short-circuit to Admit, and the engine fails toward Admit on missing data.
