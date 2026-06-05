// CareLoop — integration shell.
// Owns the single DemoState, calls the clinical engine (the ONLY place clinical
// functions run), and wires the three pure views behind a top stepper.
// "UI never computes clinically" — views receive ScoreResult / TierResult as props.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatientRecord, ScoreResult } from './types';
import { PACKETS } from './data/packets';
import { MRS_R_SERIES } from './data/monitoring';
import { extractPacket } from './lib/extraction';
import { scoreEligibility, assessTrend } from './engine/scoring';
import { Stepper } from './components/primitives';
import type { Step } from './components/primitives';
import TriageView from './views/TriageView';
import type { Decision } from './views/TriageView';
import HandoffView from './views/HandoffView';
import DashboardView from './views/DashboardView';

type View = 'triage' | 'handoff' | 'monitoring';

interface DemoState {
  packetId: string;
  record: PatientRecord | null;
  scoreResult: ScoreResult | null;
  handoffSent: boolean;
  day: number;
  forceFallback: boolean;
  view: View;
  // Per-patient logged decision. Once set, that patient's action row locks until Reset.
  decisions: Record<string, Decision>;
  telehealthScheduled: boolean;
  extracting: boolean;
  source: 'live' | 'cache';
}

const DECISION_LOG: Record<Decision, string> = {
  home: 'Decision: home · Dr. demo · 14:02 · logged',
  admit: 'Decision: admit · Dr. demo · 14:02 · logged',
};

const STEPS: Step[] = [
  { id: 'triage', label: 'Triage' },
  { id: 'handoff', label: 'Hand-off' },
  { id: 'monitoring', label: 'Home monitoring' },
];

const VIEW_BY_INDEX: View[] = ['triage', 'handoff', 'monitoring'];
const INDEX_BY_VIEW: Record<View, number> = { triage: 0, handoff: 1, monitoring: 2 };

const DEFAULT_PACKET_ID = 'mrs-r';

export default function App() {
  const [state, setState] = useState<DemoState>({
    packetId: DEFAULT_PACKET_ID,
    record: null,
    scoreResult: null,
    handoffSent: false,
    day: 1,
    forceFallback: false,
    view: 'triage',
    decisions: {},
    telehealthScheduled: false,
    extracting: true,
    source: 'cache',
  });

  // Guards against a stale async extraction (rapid packet switching) clobbering
  // the current selection.
  const runIdRef = useRef(0);

  // --- extraction + scoring (the ONLY clinical compute site) ---------------
  const runExtraction = useCallback((packetId: string, forceFallback: boolean) => {
    const packet = PACKETS.find((p) => p.id === packetId);
    if (!packet) return;

    const runId = ++runIdRef.current;
    setState((s) => ({ ...s, extracting: true, record: null, scoreResult: null }));

    void extractPacket(
      { rawText: packet.rawText, cachedRecord: packet.cachedRecord },
      { forceFallback },
    ).then((result) => {
      if (runId !== runIdRef.current) return; // superseded by a newer run
      const scoreResult = scoreEligibility(result.record);
      // Populate record + score first; clear "extracting" after the populate beat
      // so the field-by-field animation in TriageView gets a window to play.
      setState((s) => ({
        ...s,
        record: result.record,
        scoreResult,
        source: result.source,
      }));
      window.setTimeout(() => {
        setState((s) => (runId === runIdRef.current ? { ...s, extracting: false } : s));
      }, 1500);
    });
  }, []);

  // Default-select Mrs. R on mount.
  useEffect(() => {
    runExtraction(DEFAULT_PACKET_ID, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- global 'F' toggles offline (forced fallback) and re-extracts -------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'f' && e.key !== 'F') return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      setState((s) => {
        const forceFallback = !s.forceFallback;
        runExtraction(s.packetId, forceFallback);
        return { ...s, forceFallback };
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runExtraction]);

  // --- handlers -------------------------------------------------------------
  const onSelectPacket = useCallback(
    (id: string) => {
      setState((s) => ({
        ...s,
        packetId: id,
        // Each patient starts back at triage; their logged decision persists.
        handoffSent: false,
        telehealthScheduled: false,
        day: 1,
        view: 'triage',
      }));
      setState((s) => {
        runExtraction(id, s.forceFallback);
        return s;
      });
    },
    [runExtraction],
  );

  const onAccept = useCallback(() => {
    // Home decision → log it for THIS patient and move to Hand-off (Send gates Monitoring).
    setState((s) =>
      s.decisions[s.packetId]
        ? s // already decided — locked
        : { ...s, decisions: { ...s.decisions, [s.packetId]: 'home' }, view: 'handoff' },
    );
  }, []);

  const onOverrideToAdmit = useCallback(() => {
    // Admit decision → log it for THIS patient; does NOT unlock the home-care flow.
    setState((s) =>
      s.decisions[s.packetId]
        ? s
        : { ...s, decisions: { ...s.decisions, [s.packetId]: 'admit' } },
    );
  }, []);

  const onSend = useCallback(() => {
    // Mark sent (unlocks Monitoring in the stepper) but STAY on Hand-off so the
    // FHIR transfer animation is visible. The user advances when ready.
    setState((s) => ({ ...s, handoffSent: true }));
  }, []);

  const onAdvanceDay = useCallback(() => {
    setState((s) => ({ ...s, day: Math.min(5, s.day + 1) }));
  }, []);

  const onTelehealth = useCallback(() => {
    // Day-4 action: schedule telehealth → reveal day 5 (the reversal).
    setState((s) => ({ ...s, telehealthScheduled: true, day: 5 }));
  }, []);

  const onStep = useCallback((index: number) => {
    setState((s) => ({ ...s, view: VIEW_BY_INDEX[index] }));
  }, []);

  const onReset = useCallback(() => {
    // Clear all decisions and the downstream flow; keep the current packet loaded.
    setState((s) => ({
      ...s,
      decisions: {},
      handoffSent: false,
      telehealthScheduled: false,
      day: 1,
      view: 'triage',
    }));
  }, []);

  // --- derived: current-patient decision + stepper unlock ------------------
  const decision = state.decisions[state.packetId] ?? null;
  const decisionLog = decision ? DECISION_LOG[decision] : null;
  const anyDecided = Object.keys(state.decisions).length > 0;

  // Hand-off unlocks when this patient is accepted home; Monitoring after Send.
  let unlockedCount = 1;
  if (decision === 'home') unlockedCount = 2;
  if (state.handoffSent) unlockedCount = 3;

  const currentIndex = INDEX_BY_VIEW[state.view];
  const offline = state.forceFallback || state.source === 'cache';

  // --- derived: monitoring tiers (engine computes; view renders) -----------
  // assessTrend(baselineDays = days 1–2, today) for each revealed day.
  const baselineDays = MRS_R_SERIES.slice(0, 2);
  const tierByDay = MRS_R_SERIES.slice(0, state.day).map((reading) =>
    assessTrend(baselineDays, reading),
  );

  return (
    <main
      style={{
        maxWidth: 1180,
        margin: '0 auto',
        padding: '20px 22px 56px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {/* Top bar: brand + stepper + offline indicator */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 className="display" style={{ margin: 0, fontSize: '1.3rem', fontWeight: 400 }}>
            CareLoop
          </h1>
          <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            CHF hospital-at-home
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {offline && (
            <span
              className="mono"
              role="status"
              style={{
                fontSize: '0.68rem',
                color: 'var(--slate-text)',
                background: 'var(--slate-chip)',
                border: '0.5px solid var(--slate-chip)',
                borderRadius: 'var(--radius-pill)',
                padding: '3px 10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span aria-hidden="true">◴</span>
              offline (cached)
            </span>
          )}
          <Stepper
            steps={STEPS}
            currentIndex={currentIndex}
            unlockedCount={unlockedCount}
            onStep={onStep}
          />
          {anyDecided && (
            <button className="btn-ghost" onClick={onReset} title="Clear all decisions and restart the demo">
              <span aria-hidden="true">↻</span> Reset demo
            </button>
          )}
        </div>
      </header>

      {/* Active view */}
      {state.view === 'triage' && (
        <TriageView
          packets={PACKETS}
          selectedPacketId={state.packetId}
          record={state.record}
          scoreResult={state.scoreResult}
          extracting={state.extracting}
          source={state.source}
          onSelectPacket={onSelectPacket}
          onAccept={onAccept}
          onOverrideToAdmit={onOverrideToAdmit}
          decisionLog={decisionLog}
          decision={decision}
        />
      )}

      {state.view === 'handoff' && state.record && state.scoreResult && (
        <HandoffView
          record={state.record}
          scoreResult={state.scoreResult}
          sent={state.handoffSent}
          onSend={onSend}
          onContinue={() => onStep(2)}
        />
      )}

      {state.view === 'monitoring' && (
        <DashboardView
          day={state.day}
          readings={MRS_R_SERIES}
          tierByDay={tierByDay}
          onAdvanceDay={onAdvanceDay}
          onTelehealth={onTelehealth}
          telehealthScheduled={state.telehealthScheduled}
        />
      )}
    </main>
  );
}
