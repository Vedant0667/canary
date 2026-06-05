# Cardinal Demo — Architecture & Build Contract

**Status:** approved basis is the team's committed PRD (`careloop-demo-prd.md`) +
scoring spec (`careloop-scoring-spec.md`). This doc is the *implementation* design:
it turns that spec into concrete module boundaries, component contracts, and a
collision-free file-ownership map so parallel agents can build without conflict.

Decision authority: the PRD/scoring spec win on any conflict. When this doc adds
detail, it fills gaps the PRD left to implementation.

---

## 1. Brainstorm conclusions (the genuinely open decisions)

The PRD locks requirements; these were the open *how* questions:

1. **State** — single `DemoState` in `App.tsx` via `useState` (no context lib, no
   redux). Shape: `{ packetId, record, scoreResult, handoffSent, day, forceFallback, view }`.
   The engine is called in `App`; views are **pure renderers** (spec §13: "UI never
   computes clinically"). Views receive `ScoreResult` / `TierResult` as props.
2. **Extraction** — Anthropic SDK in the browser (`dangerouslyAllowBrowser: true`),
   `claude-sonnet-4-6`, tool-use forced JSON. 6 s timeout → silent fallback to the
   committed cached JSON. No key in env ⇒ always cache. `F` key forces fallback.
   Cache is indistinguishable on stage (PRD §3).
3. **Fonts** — Fraunces (display serif) via Google Fonts `<link>` (soft dependency,
   serif fallback). Body = system-ui. Mono = ui-monospace stack. No network-hard fonts.
4. **Charts** — hand-rolled inline SVG `Sparkline` (already built). No chart library.
5. **Tier rendering** — centralized in `components/primitives.tsx` (already built) so
   every tier is color + icon + word (a11y iron rule).
6. **Testing** — vitest on the engine only, asserting the §10–§12 worked examples.

## 2. Module boundaries & data flow

```
packet text ──► lib/extraction.ts ──► PatientRecord ──► engine/scoring.ts ──► ScoreResult ──► TriageView
   (md)          (live API | cache)                       (pure)                                HandoffView
data/monitoring.ts (Reading[]) ──► engine/scoring.assessTrend() ──► TierResult ──► DashboardView
```

- `engine/scoring.ts` — **zero imports** except `../types`. Pure, synchronous.
  Exports `scoreEligibility(record): ScoreResult` and
  `assessTrend(baselineDays: Reading[], today: Reading): TierResult`.
- `lib/extraction.ts` — the ONLY async/IO module. `extractPacket(packet, {forceFallback}):
  Promise<{ record: PatientRecord; source: 'live' | 'cache' }>`.
- Views import only `../types`, `../components/primitives`, and their own props. They
  do **not** import the engine or each other.
- `App.tsx` owns state, calls the engine, and wires the three views + stepper.

## 3. File-ownership map (collision-free — one owner per file)

Already built (foundation, do not edit): `src/types.ts`, `src/styles/tokens.css`,
`src/main.tsx`, `src/components/primitives.tsx`, `index.html`, `vitest.config.ts`.

| Owner (agent) | Files |
|---|---|
| **engine** | `src/engine/scoring.ts`, `src/engine/scoring.test.ts` |
| **data** | `src/data/packets/{mrs-r,mr-d,ms-k}.md`, `src/data/extractions/{mrs-r,mr-d,ms-k}.json`, `src/data/packets.ts`, `src/data/monitoring.ts` |
| **extraction** | `src/lib/extraction.ts` |
| **view-triage** | `src/views/TriageView.tsx` (+ `src/views/triage/*` if needed) |
| **view-handoff** | `src/views/HandoffView.tsx` (+ `src/views/handoff/*`) |
| **view-dashboard** | `src/views/DashboardView.tsx` (+ `src/views/dashboard/*`) |
| **integration** | `src/App.tsx` (runs AFTER the six above) |

No two agents write the same file. Views never import each other.

## 4. Component contracts (props the integration agent will pass)

```ts
// TriageView
interface TriageViewProps {
  packets: PacketMeta[];            // from data/packets.ts
  selectedPacketId: string;
  record: PatientRecord | null;     // null while "extracting"
  scoreResult: ScoreResult | null;
  extracting: boolean;              // drives the field-by-field populate animation
  source: 'live' | 'cache';
  onSelectPacket: (id: string) => void;
  onAccept: () => void;             // → unlocks Hand-off
  onOverrideToAdmit: () => void;
  decisionLog: string | null;       // e.g. "Decision: home · Dr. demo · 14:02 · logged"
}

// HandoffView
interface HandoffViewProps {
  record: PatientRecord;
  scoreResult: ScoreResult;
  sent: boolean;
  onSend: () => void;               // → unlocks Monitoring
}

// DashboardView
interface DashboardViewProps {
  day: number;                      // 1..5, current revealed day
  readings: Reading[];              // monitoring.ts full 5-day series (slice to `day`)
  tierByDay: TierResult[];          // assessTrend per revealed day (index 0 = day 1)
  onAdvanceDay: () => void;
  onTelehealth: () => void;         // day-4 action → reveals day 5 reversal
  telehealthScheduled: boolean;
}
```

`PacketMeta` (from `data/packets.ts`):
```ts
interface PacketMeta {
  id: 'mrs-r' | 'mr-d' | 'ms-k';
  label: string;          // "Mrs. R"
  blurb: string;          // "72F CHF, stable, daughter caregiver"
  rawText: string;        // the styled hospital packet markdown (imported ?raw)
  cachedRecord: PatientRecord; // committed extraction JSON
}
```

## 5. Acceptance (drives the check phase — PRD §8)

1. Three packets → **86/Eligible**, **Watch**, **Admit**, matching scoring spec §11.
2. Every on-screen number traces to a `contributions` record (no contradicting copy).
3. Day 4 flips Yellow while every absolute value is individually in range; caption present.
4. Accept / Override visually identical weight; trust footer on clinical surfaces.
5. App fully works offline (`F` key forces fallback).
6. `npm test` green; `npm run dev` demo-ready in one command; `npm run build` clean.

## 6. Design system — see PRD §6 / `tokens.css`. Iron rules:
non-slate/neutral color ⇒ must encode a tier; Accept/Override equal weight; tier =
color + icon + word; no shadows/gradients; mono for all numerics/labels/captions;
weights 400/500; sentence case; 14px card radius, 0.5px borders.
