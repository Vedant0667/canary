# Cardinal (was CareLoop) — Redesign + De-hardcode + Rename

Source of truth: PRD + scoring-spec in `docs/`. New design system: `docs/design-system.md`
(from `~/Downloads/-design-system.pdf`). Judging rubric: `docs/judging-criteria.md`.

## Why this round
Prep meeting feedback:
1. Judges will run the demo "through AI" to confirm it actually works and isn't fully
   hardcoded. Some canned data is fine; the AI + engine path must be genuinely live.
2. Rename the product **CareLoop → Cardinal**.
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
- [ ] tokens.css: body font → Geist, display Fraunces 500, header → Cardinal (palette already on-system)
- [ ] index.html: title/meta → Cardinal, drop Google Fonts CDN (now bundled)
- [ ] package.json name → cardinal
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
