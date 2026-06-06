# Canary (was CareLoop) — Redesign + De-hardcode + Rename

Source of truth: PRD + scoring-spec in `docs/`. New design system: `docs/design-system.md`
(from `~/Downloads/-design-system.pdf`). Judging rubric: `docs/judging-criteria.md`.

## Why this round
Prep meeting feedback:
1. Judges will run the demo "through AI" to confirm it actually works and isn't fully
   hardcoded. Some canned data is fine; the AI + engine path must be genuinely live.
2. Rename the product **CareLoop → Canary**.
3. Redesign around the provided design system (Cream/Ink/Stone/Slate; Recoleta→Fraunces
   display, Suisse→Geist body, Geist Mono; no italics; cream bg).
4. Still: superpowers spec + subagents, impeccable for design, todo + lessons.

## Reality check (good news)
- Scoring engine = genuine deterministic rules engine (computes from inputs, not a lookup). KEEP.
- Extraction = real Anthropic tool-use call when `VITE_ANTHROPIC_API_KEY` set; silent cache fallback.
- Palette in tokens.css already matches the design system. Main visual gap = fonts (system-ui → Geist).

## Plan

### Phase 0 — Foundation (orchestrator, blocking) [~]
- [x] Install @fontsource Fraunces(variable)/Geist/Geist-mono
- [ ] `src/styles/fonts.css` (latin subsets) + import in main.tsx
- [ ] tokens.css: body font → Geist, display Fraunces 500, header → Canary (palette already on-system)
- [ ] index.html: title/meta → Canary, drop Google Fonts CDN (now bundled)
- [ ] package.json name → canary
- [ ] Capture design-system.md + judging-criteria.md into docs/

### Phase 1 — De-hardcode core (orchestrator, blocking)
- [ ] extraction.ts: add `extractText(rawText, {requireLive})` — live-only path, no silent cache, honest errors
- [ ] App.tsx: custom-packet input state + `onExtractCustom`; honest live/cache provenance; rename brand
- [ ] Provenance surfaced: which fields came from the note + live vs cache badge that tells the truth

### Phase 2 — Redesign views (parallel subagents, disjoint files)
- [ ] TriageView: apply design system + wire the "paste a referral note → live extract → score" affordance
- [ ] HandoffView: apply design system
- [ ] DashboardView: apply design system
- [ ] primitives.tsx restyle (orchestrator, shared — done before fan-out)

### Phase 3 — Judging alignment (subagent)
- [ ] JUDGING.md: map demo capabilities → Round 1 rubric (Functionality/Problem Alignment/UX) + beyond

### Phase 4 — Check (parallel subagents) — DONE
- [x] Build + typecheck + tests green (tsc 0, 23/23, vite build clean)
- [x] Anti-hardcode audit: clean — no view re-derives a clinical verdict; extractLive is real, honest errors; engine is input-driven. (P2: dashboard shared in-range flag → fixed per-vital)
- [x] Design-system audit: P0 watch-tier text contrast 2.61:1 (the day-4 alert!) → fixed; pass/admit text darkened; EhrChrome hexes → tokens; display weight override dropped

### Phase 5 — Fix + finalize (orchestrator) — DONE
- [x] Darkened tier -text tokens to ≥4.5:1 on every bg (verified numerically)
- [x] Engine emits per-vital weight/spo2/hr_in_range; dashboard renders each independently
- [x] Wired "Notify physician" to a real acknowledged state (was no-op)
- [x] Screenshot-verified triage / hand-off / day-4 monitoring; removed temp deep-link
- [ ] Commit + push, update memory

## Status: REDESIGN + DE-HARDCODE + RENAME COMPLETE.
`npm run dev` → demo-ready. Press F to toggle offline/cached. Set VITE_ANTHROPIC_API_KEY
for live extraction; "Paste a referral note" proves the live AI path on arbitrary input.
See JUDGING.md for the rubric mapping + anti-hardcoding talking points.

## Round 6 — extraction robustness + generate-a-patient + notify-physician (2026-06-05)
- [x] extraction.ts: hardened SYSTEM_PROMPT — capture every stated value, unit
      normalization (°F→°C, kg→lb), explicit weight-window rule so a long-window
      weight change is NOT mislabeled as a 72h delta (which would false-trigger the
      admit red flag). Note re the user's test note: temp was genuinely absent →
      null is correct; +5 lb/10 days correctly stays out of the 72h field (only
      weight_lb is captured). No schema/engine change → 23/23 tests still pass.
- [x] generateScenario() in extraction.ts: Claude writes a fresh synthetic CHF note
      (3 archetypes × random seed for variety), which flows through the SAME
      extractLive + scoreEligibility path. Triage now works for unbounded patients.
- [x] App.tsx: state `generating` / `customNote` / `intervention`; handlers
      onGenerateScenario + onNotifyPhysician; telehealth generalized to `intervention`.
- [x] TriageView: "Generate a patient" button (live-gated), generating UI, custom
      card now shows the source note ("Live patient · view note").
- [x] DashboardView: "Notify physician" now drives the day-5 reversal like telehealth
      (mutually exclusive); closing banner copy reflects which action was taken.
- [x] tsc 0 · 23/23 tests · vite build clean. (2 lint errors are PRE-EXISTING
      set-state-in-effect on App.tsx:122 mount + DashboardView:102 setPinned.)
- [ ] NOT live-tested: no API key in .env yet. User must paste key + `npm run dev`
      to exercise live extraction + generation. All non-live paths verified.

## Round 7 — per-patient monitoring + symptom integration + live-call fixes (2026-06-05)
- [x] Live-call hardening: generation timeout 18s→45s, extract 18s→35s; abort now
      detected as timeout (SDK throws APIUserAbortError, not name AbortError);
      live failures surface a visible banner + console.error (were silently hidden).
- [x] Generation completeness: max_tokens 700→1400 (700 truncated devices+home, the
      last sections); prompt now requires devices + every home factor, and states the
      weight trend over 72h specifically (was "recent trend" → extracted as null).
- [x] Per-patient home monitoring: synthesizeTrajectory(record) fabricates the full
      hospital→home arc from a patient's discharge vitals (Mrs. R keeps hand-authored
      data). Day-4 converging-trend catch reproduces for any patient (verified YELLOW).
      Roster + alert show the real patient name/MRN. Works for generated/pasted patients.
- [x] Symptoms in scoring: triage already integrates them (Gate A 0.15 + RF3/RF4 +
      confidence). assessTrend now ALSO takes a daily symptom (at_rest→red,
      exertional→≥yellow, never de-escalates) — escalation truth table verified.
- [x] Daily symptom check-in UI in DashboardView: asks the provider each day, feeds
      the engine tier, shows result + per-day history. Defaults unreported (Mrs. R demo
      unchanged). tsc 0 · 23/23 · build clean.

## BACKLOG — Configurable per-practitioner templates (Round 2 productization) — NOT BUILT
Concept (from product summary): template-driven but customizable home-care platform —
clinicians configure WHICH data points they track per patient/condition. Start from
condition templates (sensible defaults), then add/remove/swap fields. Supports varied
data types (vitals, labs, symptom scores, free-text, patient-reported). A configurable
dashboard layer on standardized templates.

Reality today: we have ONE hardcoded CHF template. Fields fixed in types.ts + extraction
schema; thresholds/weights are inline magic numbers in scoring.ts; dashboard hardwired to
weight/SpO2/HR. This is the SAME gap as JUDGING.md §7's "configuration over customization"
claim — currently aspirational, not real. A medically/technically literate judge reading
scoring.ts will see the contradiction.

Options:
### UPDATE 2026-06-06 — Option B STARTED (backend + drag-and-drop datasets shipped)
- [x] Real backend: `server/` Express + SQLite (better-sqlite3). Tables metrics /
      monitor_config / metric_series. Endpoints /api/metrics, /api/patients/:key/monitoring
      (GET), /api/patients/:key/monitoring/config (PUT), /api/health. Vite proxy /api → :8787.
      `npm run dev:all` runs web+api; `npm run dev` (vite only) unchanged as safe fallback.
- [x] Drag-and-drop configurable monitoring datasets in DashboardView (MonitoredDatasets.tsx) —
      add/remove/reorder which datasets a patient is monitored on; persisted per patient to SQLite.
      Synthetic series. Fail-safe: hides if backend offline so the core demo never breaks.
- [x] Lazy patient creation (any key gets default config + series). Mrs. R seeded (mrn 4471932).
- [ ] Still TODO for full Option B: make the scoring-engine thresholds genuinely config-driven
      (currently still inline in scoring.ts); wire the configured dataset set into the engine.
- [ ] (A) Round 1: keep as roadmap narrative; be upfront it's not built. (lowest effort, honest)
- [ ] (B) Pre-Round-2: build a minimal REAL config — a "tracked fields" toggle so the
      monitoring dashboard watches a configurable signal set; demo Practitioner A
      (fluid-focused: weight/BP/edema/sodium) vs B (data-heavy: +HR rhythm/SpO2/med-adherence)
      on the same patient. Hard part = engine reweighting per config. Externalize the
      inline thresholds in scoring.ts into a config object as the first step.
- [ ] (C) Add COPD + diabetes as template stubs for narrative variety (engine is CHF-
      specific today, so real support is large; stubs only unless (B) lands first).
- [ ] Optional: draft a clean product-concept doc to send to the dev/uncle for clinical
      sanity-check on the CHF metric set before demo.
- Decision pending from Vedant: A vs B (recommended A for R1, B before R2).
