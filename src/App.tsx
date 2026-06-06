// Canary — integration shell.
// Owns the single DemoState, calls the clinical engine (the ONLY place clinical
// functions run), and wires the three pure views behind a top stepper.
// "UI never computes clinically" — views receive ScoreResult / TierResult as props.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatientRecord, ScoreResult, Dyspnea, Reading, TierResult } from './types';
import { PACKETS, type PacketMeta } from './data/packets';
import {
  MRS_R_SERIES,
  MRS_R_TIMELINE,
  synthesizeTrajectory,
  type TimelinePoint,
} from './data/monitoring';
import { extractPacket, extractLive, generateScenario } from './lib/extraction';
import { scoreEligibility, assessTrend } from './engine/scoring';
import { Stepper } from './components/primitives';
import type { Step } from './components/primitives';
import TriageView from './views/TriageView';
import type { Decision } from './views/TriageView';
import HandoffView from './views/HandoffView';
import DashboardView from './views/DashboardView';

type View = 'triage' | 'handoff' | 'monitoring';

// The day-4 escalation can be resolved by either of two equal-weight actions.
// Whichever is taken reveals the day-5 recovery and tailors the closing banner.
type Intervention = 'telehealth' | 'physician';

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
  // Which day-4 intervention was taken (null until the coordinator acts).
  intervention: Intervention | null;
  extracting: boolean;
  // True while Claude is writing a brand-new synthetic patient (before extraction).
  generating: boolean;
  source: 'live' | 'cache';
  // Where the readiness score was computed: 'api' = the backend engine (default),
  // 'local' = the in-bundle engine fallback when the API is unreachable.
  scoredBy: 'api' | 'local';
  // Live extraction of a pasted/generated, never-before-seen note. Null unless the
  // user used the paste-a-note or generate path; carries an honest error if it fails.
  customError: string | null;
  // The raw source note behind a custom record (pasted or generated), so the UI can
  // show exactly what text produced the displayed extraction.
  customNote: string | null;
  // Daily provider-reported symptom status during home monitoring (day → status).
  // Feeds assessTrend so symptoms escalate the daily tier, not just vitals.
  symptomByDay: Record<number, Dyspnea>;
}

// True when a real Anthropic key is configured at build time. Drives honest
// provenance copy ("live" vs "cached demo data") and gates the paste-a-note path.
const LIVE_AVAILABLE = Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY);
const CUSTOM_PACKET_ID = 'custom';

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

// Clinical compute is owned by the backend (Express + SQLite running the same
// deterministic engine). These helpers POST to it — which also PERSISTS the input
// record, the score, the trajectory readings, and each day's trend tier — and fall
// back to the in-bundle engine only when the API is unreachable, so the demo still
// works offline. Same engine on both sides ⇒ identical results either way.
type ScoredBy = 'api' | 'local';

async function computeScore(
  patientKey: string,
  record: PatientRecord,
  source: 'live' | 'cache',
): Promise<{ score: ScoreResult; scoredBy: ScoredBy }> {
  try {
    const r = await fetch(`/api/patients/${encodeURIComponent(patientKey)}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ record, source }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return { score: d.score as ScoreResult, scoredBy: 'api' };
  } catch (err) {
    console.warn('[canary] /score unavailable, using local engine:', err);
    return { score: scoreEligibility(record), scoredBy: 'local' };
  }
}

async function fetchTrajectory(
  patientKey: string,
  packetId: string,
  record: PatientRecord | null,
): Promise<{ series: Reading[]; timeline: TimelinePoint[] }> {
  const local = () =>
    packetId === 'mrs-r' || !record
      ? { series: MRS_R_SERIES, timeline: MRS_R_TIMELINE }
      : synthesizeTrajectory(record);
  try {
    const r = await fetch(`/api/patients/${encodeURIComponent(patientKey)}/trajectory`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ packetId, record }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch {
    return local();
  }
}

async function fetchTiers(
  patientKey: string,
  series: Reading[],
  symptomByDay: Record<number, Dyspnea>,
): Promise<TierResult[]> {
  const local = () => {
    const baseline = series.slice(0, 2);
    return series.map((reading) => assessTrend(baseline, reading, symptomByDay[reading.day] ?? null));
  };
  try {
    const r = await fetch(`/api/patients/${encodeURIComponent(patientKey)}/trends`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ series, symptomByDay }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return d.tiers as TierResult[];
  } catch {
    return local();
  }
}

export default function App() {
  const [state, setState] = useState<DemoState>({
    packetId: DEFAULT_PACKET_ID,
    record: null,
    scoreResult: null,
    handoffSent: false,
    day: 1,
    forceFallback: false,
    view: 'monitoring', // open straight to Home monitoring (dev/demo convenience)
    decisions: {},
    intervention: null,
    extracting: true,
    generating: false,
    source: 'cache',
    scoredBy: 'local',
    customError: null,
    customNote: null,
    symptomByDay: {},
  });

  // Guards against a stale async extraction (rapid packet switching) clobbering
  // the current selection.
  const runIdRef = useRef(0);

  // Discharge packets are loaded FROM THE DATABASE (GET /api/packets). The bundled
  // PACKETS is only an offline fallback so the demo survives with no backend.
  const [packets, setPackets] = useState<PacketMeta[]>(PACKETS);
  const packetsRef = useRef<PacketMeta[]>(PACKETS);

  // --- extraction + scoring (the ONLY clinical compute site) ---------------
  const runExtraction = useCallback((packetId: string, forceFallback: boolean) => {
    const packet = packetsRef.current.find((p) => p.id === packetId);
    if (!packet) return;

    const runId = ++runIdRef.current;
    setState((s) => ({ ...s, extracting: true, record: null, scoreResult: null }));

    void extractPacket(
      { rawText: packet.rawText, cachedRecord: packet.cachedRecord },
      { forceFallback },
    ).then((result) => {
      if (runId !== runIdRef.current) return; // superseded by a newer run
      // Populate the record immediately; the score comes back from the backend
      // engine (which also persists it), then we clear "extracting" after a beat
      // so the field-by-field animation in TriageView gets a window to play.
      setState((s) => ({ ...s, record: result.record, source: result.source }));
      void computeScore(result.record.mrn || packetId, result.record, result.source).then(
        ({ score, scoredBy }) => {
          if (runId !== runIdRef.current) return;
          setState((s) => ({ ...s, scoreResult: score, scoredBy }));
          window.setTimeout(() => {
            setState((s) => (runId === runIdRef.current ? { ...s, extracting: false } : s));
          }, 1500);
        },
      );
    });
  }, []);

  // Load packets from the database, then run the default extraction. Falls back
  // to the bundled packets (already in state) if the backend is unreachable.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/packets')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((rows: PacketMeta[]) => {
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return;
        packetsRef.current = rows;
        setPackets(rows);
      })
      .catch((err) => console.warn('[canary] /api/packets unavailable, using bundled fallback:', err))
      .finally(() => {
        if (!cancelled) runExtraction(DEFAULT_PACKET_ID, false);
      });
    return () => {
      cancelled = true;
    };
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
        intervention: null,
        day: 1,
        view: 'triage',
        customError: null,
        customNote: null,
        symptomByDay: {},
      }));
      setState((s) => {
        runExtraction(id, s.forceFallback);
        return s;
      });
    },
    [runExtraction],
  );

  // --- live extraction of a pasted, never-before-seen referral note ---------
  // No cached fallback: if the model can't run we show an honest error instead
  // of fabricating a record. This is the anti-hardcoding proof — arbitrary text
  // in, real structured record + real engine score out.
  const onExtractCustom = useCallback((rawText: string) => {
    const runId = ++runIdRef.current;
    setState((s) => ({
      ...s,
      packetId: CUSTOM_PACKET_ID,
      record: null,
      scoreResult: null,
      extracting: true,
      generating: false,
      source: 'live',
      customError: null,
      customNote: rawText,
      handoffSent: false,
      intervention: null,
      day: 1,
      view: 'triage',
      symptomByDay: {},
    }));

    void extractLive(rawText).then((res) => {
      if (runId !== runIdRef.current) return; // superseded
      if (!res.ok) {
        setState((s) => ({ ...s, extracting: false, customError: res.message, record: null, scoreResult: null }));
        return;
      }
      setState((s) => ({ ...s, record: res.record, source: 'live' }));
      void computeScore(res.record.mrn || CUSTOM_PACKET_ID, res.record, 'live').then(
        ({ score, scoredBy }) => {
          if (runId !== runIdRef.current) return;
          setState((s) => ({ ...s, scoreResult: score, scoredBy }));
          window.setTimeout(() => {
            setState((s) => (runId === runIdRef.current ? { ...s, extracting: false } : s));
          }, 1200);
        },
      );
    });
  }, []);

  // --- generate a brand-new synthetic patient, then extract + score it -------
  // Claude writes a fresh CHF referral note (no cache), which is then run through
  // the exact same live extraction path as a pasted note. Makes the triage screen
  // work for an unbounded set of patients, not just the three canned packets.
  const onGenerateScenario = useCallback(() => {
    if (!LIVE_AVAILABLE) return;
    const runId = ++runIdRef.current;
    setState((s) => ({
      ...s,
      packetId: CUSTOM_PACKET_ID,
      record: null,
      scoreResult: null,
      extracting: false,
      generating: true,
      source: 'live',
      customError: null,
      customNote: null,
      handoffSent: false,
      intervention: null,
      day: 1,
      view: 'triage',
      symptomByDay: {},
    }));

    void generateScenario().then((res) => {
      if (runId !== runIdRef.current) return; // superseded by a newer action
      if (!res.ok) {
        setState((s) => ({ ...s, generating: false, customError: res.message }));
        return;
      }
      setState((s) => ({ ...s, generating: false }));
      // Hand the fresh note to the same live extract + score path.
      onExtractCustom(res.rawText);
    });
  }, [onExtractCustom]);

  const onDecideHome = useCallback(() => {
    // Home disposition → log it for THIS patient and move to Hand-off (Send gates
    // Monitoring). Works whether home is the recommendation or a documented override.
    setState((s) =>
      s.decisions[s.packetId]
        ? s // already decided — locked
        : { ...s, decisions: { ...s.decisions, [s.packetId]: 'home' }, view: 'handoff' },
    );
  }, []);

  const onDecideAdmit = useCallback(() => {
    // Admit disposition → log it for THIS patient; does NOT unlock the home-care flow.
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

  const onReportSymptom = useCallback((day: number, symptom: Dyspnea) => {
    // Home-care provider's daily symptom check-in. Recorded per day and fed into
    // the engine's trend tier (assessTrend), so symptoms can escalate a day.
    setState((s) => ({ ...s, symptomByDay: { ...s.symptomByDay, [day]: symptom } }));
  }, []);

  const onTelehealth = useCallback(() => {
    // Day-4 action: schedule telehealth → reveal day 5 (the reversal).
    setState((s) => (s.intervention ? s : { ...s, intervention: 'telehealth', day: 5 }));
  }, []);

  const onNotifyPhysician = useCallback(() => {
    // Day-4 alternative: notify the physician → same day-5 reversal, physician-led.
    setState((s) => (s.intervention ? s : { ...s, intervention: 'physician', day: 5 }));
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
      intervention: null,
      day: 1,
      view: 'triage',
      packetId: DEFAULT_PACKET_ID,
      customError: null,
      customNote: null,
      symptomByDay: {},
    }));
    setState((s) => {
      runExtraction(DEFAULT_PACKET_ID, s.forceFallback);
      return s;
    });
  }, [runExtraction]);

  // --- derived: current-patient decision + stepper unlock ------------------
  const decision = state.decisions[state.packetId] ?? null;
  const decisionLog = decision ? DECISION_LOG[decision] : null;
  const anyDecided = Object.keys(state.decisions).length > 0;

  // All three steps are freely navigable (we open on Home monitoring), so the
  // stepper doubles as a way to jump straight to any view.
  const unlockedCount = STEPS.length;

  const currentIndex = INDEX_BY_VIEW[state.view];
  const offline = state.forceFallback || state.source === 'cache';

  // --- monitoring trajectory (computed on the backend, persisted) ----------
  // Mrs. R ships a hand-authored series; every other patient (the canned packets
  // and live-generated/pasted ones) gets a trajectory synthesized from their own
  // discharge vitals. The backend owns the synthesis; we fetch it here.
  const [trajectory, setTrajectory] = useState<{ series: Reading[]; timeline: TimelinePoint[] }>({
    series: MRS_R_SERIES,
    timeline: MRS_R_TIMELINE,
  });
  useEffect(() => {
    let cancelled = false;
    const key = state.record?.mrn || state.packetId;
    void fetchTrajectory(key, state.packetId, state.record).then((t) => {
      if (!cancelled) setTrajectory(t);
    });
    return () => {
      cancelled = true;
    };
  }, [state.packetId, state.record]);

  const monitoringName = state.record?.name ?? 'Patient';
  const monitoringMrn = state.record?.mrn ?? '—';

  // --- monitoring tiers (backend assesses each day's trend, persists it) ----
  // The engine computes assessTrend(baseline = days 1–2, today) for the whole
  // series on the server; we keep the revealed-day slice for the dashboard.
  const [tierByDay, setTierByDay] = useState<TierResult[]>([]);
  useEffect(() => {
    let cancelled = false;
    const key = state.record?.mrn || state.packetId;
    void fetchTiers(key, trajectory.series, state.symptomByDay).then((tiers) => {
      if (!cancelled) setTierByDay(tiers.slice(0, state.day));
    });
    return () => {
      cancelled = true;
    };
  }, [trajectory.series, state.day, state.symptomByDay, state.packetId, state.record]);

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
          <h1 className="display" style={{ margin: 0, fontSize: '1.5rem', lineHeight: 1 }}>
            Canary
          </h1>
          <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            CHF hospital-at-home
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span
            className="mono"
            role="status"
            title={
              offline
                ? 'Showing committed cached extractions. Press F to toggle, or set VITE_ANTHROPIC_API_KEY for live extraction.'
                : 'Extractions are running live against the Anthropic API.'
            }
            style={{
              fontSize: '0.68rem',
              color: offline ? 'var(--slate-text)' : 'var(--pass-text)',
              background: offline ? 'var(--slate-chip)' : 'var(--pass-bg)',
              border: '0.5px solid transparent',
              borderRadius: 'var(--radius-pill)',
              padding: '3px 10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span aria-hidden="true">{offline ? '◴' : '◉'}</span>
            {offline ? 'offline · cached' : 'live · Claude'}
          </span>
          <span
            className="mono"
            role="status"
            title={
              state.scoredBy === 'api'
                ? 'Home readiness was computed by the backend clinical engine (Express + SQLite) and persisted to the database.'
                : 'Backend API unreachable — readiness computed by the in-bundle engine fallback (identical deterministic logic).'
            }
            style={{
              fontSize: '0.68rem',
              color: state.scoredBy === 'api' ? 'var(--pass-text)' : 'var(--slate-text)',
              background: state.scoredBy === 'api' ? 'var(--pass-bg)' : 'var(--slate-chip)',
              border: '0.5px solid transparent',
              borderRadius: 'var(--radius-pill)',
              padding: '3px 10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span aria-hidden="true">⛁</span>
            {state.scoredBy === 'api' ? 'scored by API' : 'scored offline'}
          </span>
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
          packets={packets}
          selectedPacketId={state.packetId}
          record={state.record}
          scoreResult={state.scoreResult}
          extracting={state.extracting}
          generating={state.generating}
          source={state.source}
          onSelectPacket={onSelectPacket}
          onDecideHome={onDecideHome}
          onDecideAdmit={onDecideAdmit}
          decisionLog={decisionLog}
          decision={decision}
          onExtractCustom={onExtractCustom}
          onGenerateScenario={onGenerateScenario}
          customError={state.customError}
          customNote={state.customNote}
          liveAvailable={LIVE_AVAILABLE}
          isCustom={state.packetId === CUSTOM_PACKET_ID}
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
          readings={trajectory.series}
          timeline={trajectory.timeline}
          patientName={monitoringName}
          patientMrn={monitoringMrn}
          tierByDay={tierByDay}
          symptomByDay={state.symptomByDay}
          onReportSymptom={onReportSymptom}
          onAdvanceDay={onAdvanceDay}
          onTelehealth={onTelehealth}
          onNotifyPhysician={onNotifyPhysician}
          intervention={state.intervention}
        />
      )}
    </main>
  );
}
