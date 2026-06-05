# CareLoop Demo — Build Plan

Source of truth: `outputs/careloop-demo-prd.md` + `careloop-scoring-spec.md`.
Implementation contract: `docs/superpowers/specs/2026-06-05-careloop-demo-design.md`.

## Phase 0 — Foundation (DONE, by orchestrator)
- [x] Scaffold Vite + React + TS at ~/careloop, deps installed (anthropic SDK, vitest)
- [x] git init, scaffolding installed, private GitHub repo (Vedant0667/careloop)
- [x] Shared contract: `src/types.ts`
- [x] Design tokens: `src/styles/tokens.css`, fonts in `index.html`
- [x] Shared primitives: `src/components/primitives.tsx`
- [x] Design/architecture doc with file-ownership map
- [x] Stub `App.tsx` so foundation compiles; initial commit

## Phase 1 — Brainstorm (subagents)
- [ ] 2 brainstorm agents surface implementation risks / divergent ideas; synthesize

## Phase 2 — Execute (parallel subagents, disjoint files)
- [ ] engine: `scoring.ts` + `scoring.test.ts` (3 cases green per spec §10–§12)
- [ ] data: 3 packets (.md) + 3 cached extractions (.json) + `packets.ts` + `monitoring.ts`
- [ ] extraction: `lib/extraction.ts` (live API + 6s timeout fallback)
- [ ] view-triage: `TriageView.tsx` (hero screen — build airtight)
- [ ] view-handoff: `HandoffView.tsx` (split-screen FHIR bundle transfer)
- [ ] view-dashboard: `DashboardView.tsx` (day stepper, day-4 yellow moment)
- [ ] integration: `App.tsx` wires state + engine + views + stepper + F-key

## Phase 3 — Check (parallel subagents)
- [ ] Engine correctness vs spec §10–§12 (run tests, read code)
- [ ] Acceptance checklist (PRD §8) + build/typecheck
- [ ] Design-system compliance vs PRD §6 (iron rules)
- [ ] Numbers trace to contributions; no contradicting hardcoded copy

## Phase 4 — Fix (parallel subagents)
- [ ] Fix each confirmed issue from Phase 3

## Phase 5 — Finalize (orchestrator)
- [ ] `npm test` green, `npm run build` clean, dev server smoke test
- [ ] Commit + push; write summary
