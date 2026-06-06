# Canary — Hackathon Demo PRD

**What:** single-page web app demoing the full Canary loop on one patient story.
**Companion file:** `careloop-scoring-spec.md` — the complete scoring engine spec (gates, thresholds, schemas, test cases). This PRD references it as **[SCORING]**; build that module first, exactly as written there.
**Source of truth for concept:** team docs `00`–`08` (esp. `07-mvp-and-roadmap.md` for scope discipline, `08-design.md` for visuals).

---

## 1. The demo in one sentence

A judge watches a hospital discharge packet get read by AI, scored by transparent rules, the doctor send Mrs. R home, her data travel to the homecare EMR untouched by fax, and the dashboard catch her deterioration on day 4 — before any single vital looks alarming.

## 2. Goals / non-goals

**Goals**
1. Prove the triage decision is real: deterministic scoring, inspectable reasoning ("why 86?" answerable live).
2. Make the hand-off visible: structured FHIR-shaped bundle auto-populating the homecare side.
3. Land the forecast moment: Yellow on day 4 with caption "no threshold alarm would have fired yet."
4. Unkillable live: zero hard dependency on network; every async step has a cached fallback.

**Non-goals (do not build — per `07`)**
- Real EHR/FHIR integration, real device ingestion, learned ML models
- Auth, database, deployment, persistence, multi-patient management
- Nurse mobile app, patient app (mention verbally only)
- OCR of scanned/handwritten documents

## 3. Tech stack

- **Vite + React + TypeScript**, single repo, client-side only. No backend.
- Scoring engine: `src/engine/scoring.ts` — pure functions per [SCORING] §13, **zero imports**, unit-tested (vitest) against [SCORING] §10–§12.
- Extraction: direct call to Anthropic API (`claude-sonnet-4-6`, tool-use forced JSON, key in `.env`, fine for a demo). **Every test packet ships with a pre-cached extraction JSON in `src/data/`; on any error/timeout > 6s, silently fall back to cache.** Keyboard shortcut `F` forces fallback mode for stage.
- Charts: tiny inline SVG sparkline/line chart — no chart library needed for 3 signals × 5 days.
- State: React context or plain useState lifted to App. One `DemoState`: `{ packet, record, scoreResult, handoffDone, day }`.

## 4. App structure — three views, one story

Top nav = three steps styled as a stepper: **① Triage → ② Hand-off → ③ Home monitoring**. Steps unlock in order (hand-off unlocks after "Accept & hand off"; monitoring after "Send").

---

### View ① — Physician triage (the hero screen; build airtight first)

Layout per `08-design.md` §7.1 (EHR-embedded panel):

1. **EHR chrome bar** — ink-black bar, mono caption `Embedded in EHR · Canary panel · MRN 4471932`. Sells "lives where the clinician works."
2. **Packet intake** — left rail with the three test packets (`Mrs. R`, `Mr. D`, `Ms. K`) as selectable documents rendered to look like a hospital flowsheet (mono table of vitals, med list, home-intake form). Selecting one triggers extraction: a brief field-by-field populate animation (~1.5s, staggered) into a structured panel — name, vitals, devices, home factors appearing as typed chips. This is the AI moment; label it `AI intake · Claude reads the packet — rules make the recommendation`.
3. **Score card** — sunken card: mono label `HOME ELIGIBILITY`, 54px score, band pill (Eligible/Watch/Admit in functional colors), confidence expander (completeness %, simulated certainty + case-similarity rows per [SCORING] §7).
4. **Three gate rows** — A Clinical stability, B Monitoring feasibility, C Home readiness. Each: status icon + mono score + chevron. Expanding shows the `contributions` records from `ScoreResult` — every signal with value, range status chip, and note. Gate with dominant deduction defaults open.
5. **Reasoning panel** — slate-left-border panel, header `WHY THIS RECOMMENDATION`, rationale string from the engine. Always present.
6. **Action row — EQUAL WEIGHT (non-negotiable, `08` §5.5)** — recommendation stated in text on the left; two identical outline buttons: `Override to admit` and `Accept & hand off`. Neither filled, neither colored. Both log to a visible mini audit line (`Decision: home · Dr. demo · 14:02 · logged`).
7. **Trust footer** — sunken bar: `Decision support · the physician decides`.

Red-flag case (Ms. K): score card shows Admit band, a flag banner names RF1 (`SpO₂ 91 — below home-manageable floor`), action row unchanged (doctor can still override either way — overriding to home shows a confirm-free audit log entry; never a guilt-trip modal).

### View ② — Hand-off (the bridge made visible; ~30 min build)

Split screen:

- **Left — Canary bundle:** after Accept, show the Continuity Record as a collapsible JSON tree styled cleanly — actual FHIR resource names: `Patient`, `Condition (I50.9)`, `MedicationStatement[]`, `Observation[]` (the vitals), `DiagnosticReport (Echocardiogram — REFERENCE, not re-ordered)`, `CarePlan`. The echo line gets a highlight chip: `travels with patient — not re-run`.
- **Right — "Accura Home Health — intake" mock:** deliberately plainer/grayer generic-EMR styling (visually NOT Canary — sells that these are two different systems). Empty intake form fields.
- **Send button** → animated transfer (fields fly/fade across, ~2s) → right side auto-populates field by field → green check `Intake complete · 0 fields re-collected · 0 studies re-ordered`. Caption underneath: `today, this hand-off is a fax and a phone call`.
- A small `view raw FHIR` toggle for judge Q&A credibility.

### View ③ — Coordinator dashboard (the payoff; ~45 min build)

Per `08` §7.2, cream page, web-dashboard feel:

1. **Metric cards:** `Home-managed: 1` · `Watch: 0` · `Admit-prompted: 0` (live-update with tier).
2. **Roster row:** Mrs. R · CHF · tier dot · last reading (mono) · 3 sparklines (weight, SpO₂, HR).
3. **Day stepper:** `Advance day ▸` button steps through the canned 5-day series from [SCORING] §12. Charts extend; baseline band (days 1–2 mean ± margin) shaded.
4. **Day 4 = the moment:** tier flips 🟡. Alert card surfaces to top: `Trajectory alert — weight +3.3 lb vs baseline, SpO₂ −2, HR +11. No single value out of range. Forecast: rising 24–48h decompensation risk.` Two equal-weight actions: `Schedule telehealth` · `Notify physician`. Clicking telehealth → day 5 shows trend reversing → tier back 🟢 → closing banner: **`Bed-days used: 0 · Readmission: none · Studies re-run: 0`**.
5. Optional (COULD): a `Push context to EHR` visual on a red-tier variant — skip unless ahead of schedule.

---

## 5. Test data (write these first — they drive everything)

Three packets as markdown/text files in `src/data/packets/`, styled like real hospital paperwork (header block, mono flowsheet table, meds list, social-work intake section). Contents and expected outputs per [SCORING] §10–§11:

| Packet | Story | Expected |
|---|---|---|
| `mrs-r.md` | 72F CHF, stable, daughter caregiver | **86 / Eligible** |
| `mr-d.md` | 68M CHF, SpO₂ 93, weight +3.1 lb, part-time caregiver | **Watch** (Gate A ≈ 67) |
| `ms-k.md` | 81F CHF, SpO₂ 91, lives alone | **Admit** (red flag RF1) |

Plus `src/data/extractions/*.json` — the cached extraction result per packet (generate once with the real API, commit them).

Switching packets live IS the "play with the inputs" demo beat (replaces sliders).

## 6. Design system (condensed from `08-design.md` — follow exactly)

- **Colors:** page `#F4EFE6` (cream) · cards `#FBF8F1` · borders `#E0D6C0` · text `#1A1714` / muted `#6B635A` · sole accent slate `#4F6E91` (+ fills `#EEF1F5`, chips `#E1E7F0`, text `#3E587A`).
- **Tier colors (functional only, never decorative):** pass/green `#5E7B3F` on `#DCE6CC` · watch/amber `#B5872F` on `#F0E6CC` · admit/red `#A8553D` on `#EBD7CE`.
- **Type:** display serif (use Fraunces from Google Fonts — Recoleta is licensed), body system-ui/Geist, **all numerics/labels/captions in mono (Geist Mono or ui-monospace)**. No italics, sentence case, weights 400/500 only.
- **Shape:** cards 14px radius, insets 10–12px, pills 20px; 0.5px borders; **no shadows, no gradients**.
- **Iron rules:** color other than slate/neutral ⇒ must encode a clinical tier. Accept/Override always equal weight. Tier always = color + icon + word (a11y).

## 7. Build order (time-boxed; each step leaves a demoable app)

| # | Step | Box |
|---|---|---|
| 1 | Scoring engine + unit tests (3 cases green) — [SCORING] | 40 min |
| 2 | Test packets + cached extractions | 20 min |
| 3 | View ① static: score card, gates, why panel, actions from hardcoded `ScoreResult` | 40 min |
| 4 | Wire packets → (cached) extraction → engine → View ①; populate animation | 25 min |
| 5 | View ② hand-off | 30 min |
| 6 | View ③ dashboard + day stepper + day-4 alert | 45 min |
| 7 | Live Claude extraction with fallback; polish pass against §6; rehearse | rest |

If behind: cut step 7's live call (cache is indistinguishable), then cut View ② animation (instant populate), never cut the why panel.

## 8. Acceptance checklist

- [ ] Three packets produce 86/Eligible, Watch, Admit — matching [SCORING] §11 exactly
- [ ] Every number on screen traces to a `contributions` record (no hardcoded copy that can contradict the engine)
- [ ] Day 4 flips Yellow while all absolute values are individually in-range; caption present
- [ ] Accept/Override visually identical weight; trust footer on clinical surfaces
- [ ] App fully works with network disabled (`F` key)
- [ ] `npm test` green; `npm run dev` → demo-ready in one command

## 9. Five-minute demo script

1. **(0:30) Problem:** "Hospital and homecare run on systems that don't talk. So stable patients take up $2,500/night beds because home is a black hole — and the data gap gets paid for in duplicate scans and late readmissions."
2. **(1:30) Triage:** load Mrs. R's packet → "Claude reads the paperwork; transparent rules make the recommendation; the doctor decides." Expand Gate A, answer "why 86" from the panel. Flip to Ms. K → red flag → Admit ("conservative by design").
3. **(1:00) Hand-off:** Accept → bundle → Send → "her echo travels with her — nothing re-collected. Today this is a fax."
4. **(1:30) Monitoring:** advance days → day 4 Yellow → "no threshold alarm would have fired yet — this is forecast, not alert" → telehealth → trend reverses.
5. **(0:30) Close:** "Bed never used. No readmission. Nothing re-scanned. CMS pays for hospital-at-home through 2030 — the money exists, the bridge doesn't. We're the bridge." Banner on screen says the same.

## 10. Q&A insurance (rehearse these)

- **Why 86?** Walk the gate expanders — live arithmetic, [SCORING] §10.
- **Is the AI making medical decisions?** No — AI only reads the packet; scoring is deterministic and inspectable; physician decides; equal-weight buttons mean even the UI doesn't nudge.
- **Liability?** Decision support never autonomy, full audit line, red flags short-circuit, fails toward Admit.
- **Real integration?** Demo mocks the pipes honestly; the bundle is real FHIR resource shapes; FHIR-first write-back is Phase 2 and the moat (`03`, `06`).
- **Why now?** CMS hospital-at-home waiver extended to Sept 30, 2030; 140+ systems approved; connective software is the missing piece (`05`).
