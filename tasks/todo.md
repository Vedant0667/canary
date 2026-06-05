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

## Phase 1 — Brainstorm (subagents) — DONE
- [x] 2 brainstorm agents (risk + polish lens) on the locked spec

## Phase 2 — Execute (parallel subagents, disjoint files) — DONE
- [x] engine: `scoring.ts` + `scoring.test.ts` (Mrs R=86, Mr D=Watch, Ms K=Admit green)
- [x] data: 3 packets (.md) + 3 cached extractions (.json) + `packets.ts` + `monitoring.ts`
- [x] extraction: `lib/extraction.ts` (live claude-sonnet-4-6 + 6s timeout → cache)
- [x] view-triage: `TriageView.tsx` (hero screen)
- [x] view-handoff: `HandoffView.tsx` (split-screen FHIR bundle transfer)
- [x] view-dashboard: `DashboardView.tsx` (day stepper, day-4 yellow moment)
- [x] integration: `App.tsx` wires state + engine + views + stepper + F-key

## Phase 3 — Check (parallel subagents) — DONE
- [x] Engine correctness vs spec §10–§12 (23/23 tests pass)
- [x] Acceptance checklist (PRD §8) + build/typecheck (tsc + build clean)
- [x] Design-system compliance vs PRD §6 (iron rules) — green banner → slate fixed
- [x] Numbers trace to contributions; no contradicting hardcoded copy

## Phase 4 — Fix (parallel subagents) — DONE
- [x] Hand-off success banner moved off green tier palette → neutral slate

## Phase 5 — Finalize (orchestrator) — DONE
- [x] `npm test` 23/23 green, `npm run build` clean, dev server smoke (all modules 200)
- [x] Commit + push; summary written

## Status: READY. `npm run dev` → demo-ready in one command. Press `F` for offline mode.
