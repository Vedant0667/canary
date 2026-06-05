// View ① — Physician triage (the hero screen).
// PURE RENDERER. The engine computes ScoreResult; this file only renders it.
// Every number on screen traces to scoreResult (gates/contributions/confidence/
// red_flags). No hardcoded clinical copy. PRD §4 View 1 + design §4 TriageViewProps.

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  PatientRecord,
  ScoreResult,
  Gate,
  Contribution,
  Device,
} from '../types';
import {
  BandPill,
  Chip,
  StatusChip,
  ThresholdLadder,
  ScoreMeter,
} from '../components/primitives';

export type Decision = 'home' | 'admit';

// PacketMeta contract (design §4). Defined locally to keep this view decoupled
// from data/packets.ts; structurally compatible with what the integration agent
// passes. We only read id/label/blurb here.
export interface PacketMeta {
  id: 'mrs-r' | 'mr-d' | 'ms-k';
  label: string;
  blurb: string;
  rawText: string;
  cachedRecord: PatientRecord;
}

export interface TriageViewProps {
  packets: PacketMeta[];
  selectedPacketId: string;
  record: PatientRecord | null;
  scoreResult: ScoreResult | null;
  extracting: boolean;
  source: 'live' | 'cache';
  onSelectPacket: (id: string) => void;
  onDecideHome: () => void;
  onDecideAdmit: () => void;
  decisionLog: string | null;
  // Once a decision is logged for this patient, the action row locks (PRD-extra:
  // no re-deciding without a reset). null = open.
  decision: Decision | null;
  // Live extraction of a pasted, never-before-seen referral note (anti-hardcode).
  onExtractCustom: (rawText: string) => void;
  customError: string | null;
  liveAvailable: boolean;
  isCustom: boolean;
}

// --- small style helpers ----------------------------------------------------

const labelStyle: CSSProperties = {
  fontSize: '0.66rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

const GATE_STATUS_ICON: Record<Gate['status'], string> = {
  pass: '●',
  watch: '◆',
  fail: '▲',
};
const GATE_STATUS_CLASS: Record<Gate['status'], string> = {
  pass: 'tier-green',
  watch: 'tier-yellow',
  fail: 'tier-red',
};
const GATE_TONE: Record<Gate['status'], 'green' | 'yellow' | 'red'> = {
  pass: 'green',
  watch: 'yellow',
  fail: 'red',
};

// =============================================================================
// EHR chrome bar (1)
// =============================================================================

function EhrChrome() {
  return (
    <div
      className="mono"
      style={{
        background: '#1a1714',
        color: '#f4efe6',
        borderRadius: 'var(--radius-card)',
        padding: '8px 14px',
        fontSize: '0.72rem',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--slate)',
          display: 'inline-block',
        }}
      />
      Embedded in EHR · Cardinal panel · MRN 4471932
    </div>
  );
}

// =============================================================================
// Packet intake left rail (2)
// =============================================================================

// A realistic, never-before-seen CHF discharge referral note, written as prose a
// discharge planner would actually type. Distinct patient from the 3 canned
// packets — gives a judge a one-click way to prove live extraction is real.
const EXAMPLE_NOTE = `Discharge referral — Eleanor Whitfield, 77F. MRN pending.

Dx: acute decompensated CHF (HFrEF), now compensated and ready for transition to hospital-at-home. Admitted 4 days ago with worsening dyspnea; diuresed well on IV furosemide, now back to PO regimen.

At discharge this AM: HR 78, BP 124/72, SpO2 95% on room air, RR 18, temp 36.8C. Weight 168 lb, down about 6 lb over the last 72 hours with diuresis. No chest pain. Mild exertional shortness of breath remaining, lower-extremity edema improving but still trace-to-mild.

Home situation: lives with her daughter who is home full-time and comfortable helping with meds and daily weights. Stable apartment, reliable wifi, power and refrigeration fine. Patient manages her own medications with daughter double-checking. Fall risk assessed low — uses a cane, steady. Has a home scale and a BP cuff already; we can drop off a pulse ox same day.

Plan: home telemonitoring, daily weights, titrate diuretic, cardiology follow-up in 1 week.`;

function PasteIntake({
  onExtractCustom,
  customError,
  liveAvailable,
  isCustom,
}: {
  onExtractCustom: (rawText: string) => void;
  customError: string | null;
  liveAvailable: boolean;
  isCustom: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const trimmed = text.trim();

  // When a custom extraction is the active source, surface it as a selected
  // "Pasted note" entry (highlighted like a chosen packet) so it's unambiguous
  // the displayed record came from the pasted text.
  if (isCustom && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-pressed={true}
        className="card"
        style={{
          textAlign: 'left',
          cursor: 'pointer',
          background: 'var(--slate-fill)',
          borderColor: 'var(--slate)',
          padding: 11,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: '0.86rem', fontWeight: 500, color: 'var(--ink)' }}>
            Pasted note
          </span>
          <span className="mono" aria-hidden="true" style={{ fontSize: '0.62rem', color: 'var(--slate-text)' }}>
            open
          </span>
        </div>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.35 }}>
          Free-text referral, extracted live by Claude.
        </span>
      </button>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn-ghost"
        style={{ justifyContent: 'flex-start', width: '100%', padding: '9px 12px' }}
      >
        <span aria-hidden="true">+</span> Paste a referral note
      </button>
    );
  }

  return (
    <div
      className="card"
      style={{
        background: isCustom ? 'var(--slate-fill)' : 'var(--card)',
        borderColor: isCustom ? 'var(--slate)' : 'var(--border)',
        padding: 11,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="mono" style={{ fontSize: '0.86rem', fontWeight: 500, color: 'var(--ink)' }}>
          Pasted note
        </span>
        <button
          onClick={() => setText(EXAMPLE_NOTE)}
          className="mono"
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: 'var(--slate-text)',
            fontSize: '0.66rem',
          }}
        >
          Load example note
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste any CHF discharge / referral note…"
        rows={7}
        className="mono"
        style={{
          width: '100%',
          resize: 'vertical',
          background: 'var(--card)',
          color: 'var(--ink)',
          border: '0.5px solid var(--border)',
          borderRadius: 10,
          padding: '9px 10px',
          fontSize: '0.72rem',
          lineHeight: 1.5,
        }}
      />

      <button
        className="btn-primary"
        onClick={() => onExtractCustom(trimmed)}
        disabled={!liveAvailable || trimmed.length === 0}
        style={{ justifyContent: 'center' }}
      >
        Extract &amp; score
      </button>

      {!liveAvailable && (
        <p
          className="mono"
          style={{ margin: 0, fontSize: '0.66rem', color: 'var(--muted)', lineHeight: 1.45 }}
        >
          Live extraction needs an Anthropic API key — set VITE_ANTHROPIC_API_KEY in .env and restart.
        </p>
      )}

      {customError && (
        <div
          role="status"
          style={{
            background: 'var(--slate-fill)',
            border: '0.5px solid var(--slate)',
            borderRadius: 10,
            padding: '7px 10px',
          }}
        >
          <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--slate-text)', lineHeight: 1.45 }}>
            {customError}
          </span>
        </div>
      )}
    </div>
  );
}

function PacketRail({
  packets,
  selectedPacketId,
  onSelectPacket,
  isCustom,
  onExtractCustom,
  customError,
  liveAvailable,
}: {
  packets: PacketMeta[];
  selectedPacketId: string;
  onSelectPacket: (id: string) => void;
  isCustom: boolean;
  onExtractCustom: (rawText: string) => void;
  customError: string | null;
  liveAvailable: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mono" style={labelStyle}>
        Discharge packets
      </div>
      {packets.map((p) => {
        const active = !isCustom && p.id === selectedPacketId;
        return (
          <button
            key={p.id}
            onClick={() => onSelectPacket(p.id)}
            aria-pressed={active}
            className="card"
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              background: active ? 'var(--slate-fill)' : 'var(--card)',
              borderColor: active ? 'var(--slate)' : 'var(--border)',
              padding: 11,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <span className="mono" style={{ fontSize: '0.86rem', fontWeight: 500, color: 'var(--ink)' }}>
                {p.label}
              </span>
              <span
                className="mono"
                aria-hidden="true"
                style={{ fontSize: '0.62rem', color: active ? 'var(--slate-text)' : 'var(--muted)' }}
              >
                {active ? 'open' : 'flowsheet'}
              </span>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.35 }}>
              {p.blurb}
            </span>
          </button>
        );
      })}

      <PasteIntake
        onExtractCustom={onExtractCustom}
        customError={customError}
        liveAvailable={liveAvailable}
        isCustom={isCustom}
      />
    </div>
  );
}

// --- AI intake panel — staggered typed-chip populate (2) --------------------

const DEVICE_LABEL: Record<Device, string> = {
  scale: 'scale',
  bp_cuff: 'bp cuff',
  pulse_ox: 'pulse ox',
  ecg_patch: 'ecg patch',
};

function fieldRows(record: PatientRecord): { label: string; chips: { text: string; key: string }[] }[] {
  const v = record.vitals;
  const h = record.home;
  const vitalChips: { text: string; key: string }[] = [];
  if (record.name != null) vitalChips.push({ key: 'name', text: record.name });
  if (record.age != null) vitalChips.push({ key: 'age', text: `${record.age} yr` });
  vitalChips.push({ key: 'cond', text: record.condition });

  const vitalsChips: { text: string; key: string }[] = [];
  if (v.hr_bpm != null) vitalsChips.push({ key: 'hr', text: `HR ${v.hr_bpm}` });
  if (v.bp_systolic != null && v.bp_diastolic != null)
    vitalsChips.push({ key: 'bp', text: `BP ${v.bp_systolic}/${v.bp_diastolic}` });
  if (v.spo2_pct != null) vitalsChips.push({ key: 'spo2', text: `SpO₂ ${v.spo2_pct}` });
  if (v.resp_rate != null) vitalsChips.push({ key: 'rr', text: `RR ${v.resp_rate}` });
  if (v.temp_c != null) vitalsChips.push({ key: 'temp', text: `${v.temp_c}°C` });
  if (v.weight_lb != null) vitalsChips.push({ key: 'wt', text: `${v.weight_lb} lb` });
  if (v.weight_delta_72h_lb != null)
    vitalsChips.push({ key: 'wd', text: `Δ72h ${v.weight_delta_72h_lb >= 0 ? '+' : ''}${v.weight_delta_72h_lb} lb` });

  const deviceChips = record.devices_available.map((d) => ({ key: d, text: DEVICE_LABEL[d] }));

  const homeChips: { text: string; key: string }[] = [];
  if (h.caregiver != null) homeChips.push({ key: 'cg', text: `caregiver ${h.caregiver.replace('_', ' ')}` });
  if (h.connectivity != null) homeChips.push({ key: 'conn', text: h.connectivity.replace('_', ' ') });
  if (h.med_self_admin != null) homeChips.push({ key: 'med', text: `meds ${h.med_self_admin}` });
  if (h.fall_risk != null) homeChips.push({ key: 'fall', text: `fall ${h.fall_risk}` });
  if (h.housing_stable != null) homeChips.push({ key: 'house', text: h.housing_stable ? 'housing stable' : 'housing unstable' });
  if (h.has_power_refrigeration != null)
    homeChips.push({ key: 'pwr', text: h.has_power_refrigeration ? 'power + fridge' : 'no power/fridge' });

  return [
    { label: 'name', chips: vitalChips },
    { label: 'vitals', chips: vitalsChips },
    { label: 'devices', chips: deviceChips },
    { label: 'home factors', chips: homeChips },
  ];
}

function TypedChip({ text, delayMs }: { text: string; delayMs: number }) {
  return (
    <span
      className="pill mono"
      style={{
        background: 'var(--slate-fill)',
        color: 'var(--ink)',
        fontSize: '0.72rem',
        animation: `cl-chip-in 240ms ease-out both`,
        animationDelay: `${delayMs}ms`,
      }}
    >
      {text}
    </span>
  );
}

function AiIntakePanel({
  record,
  extracting,
  source,
}: {
  record: PatientRecord | null;
  extracting: boolean;
  source: 'live' | 'cache';
}) {
  const rows = record ? fieldRows(record) : [];
  // Stagger across all chips so the populate reads field-by-field (~1.5s total).
  let chipIndex = 0;
  const totalChips = rows.reduce((n, r) => n + r.chips.length, 0) || 1;
  const stepMs = Math.min(70, Math.floor(1400 / totalChips));

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{`
        @keyframes cl-chip-in {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cl-blink { 50% { opacity: 0.25; } }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div className="mono" style={labelStyle}>
          AI intake · Claude reads the packet — rules make the recommendation
        </div>
        {record && (
          <Chip tone="slate">
            <span aria-hidden="true">{source === 'live' ? '◆' : '○'}</span>
            <span style={{ fontSize: '0.66rem' }}>
              {source === 'live' ? 'Extracted live by Claude' : 'Cached demo extraction'}
            </span>
          </Chip>
        )}
      </div>

      {!record && !extracting && (
        <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
          Select a discharge packet to read it.
        </div>
      )}

      {extracting && !record && (
        <div className="mono" style={{ fontSize: '0.78rem', color: 'var(--slate-text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          reading packet
          <span aria-hidden="true" style={{ animation: 'cl-blink 900ms steps(1) infinite' }}>▋</span>
        </div>
      )}

      {record &&
        rows.map((row) => (
          <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className="mono" style={{ ...labelStyle, fontSize: '0.6rem' }}>
              {row.label}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {row.chips.length === 0 ? (
                <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                  not stated
                </span>
              ) : (
                row.chips.map((c) => {
                  const delay = extracting ? chipIndex++ * stepMs : 0;
                  return <TypedChip key={`${row.label}-${c.key}`} text={c.text} delayMs={delay} />;
                })
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

// =============================================================================
// Score card (3)
// =============================================================================

function ScoreCard({ scoreResult }: { scoreResult: ScoreResult }) {
  const [open, setOpen] = useState(false);
  const c = scoreResult.confidence;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const admit = scoreResult.band === 'admit';
  const overallTone =
    scoreResult.band === 'eligible' ? 'green' : scoreResult.band === 'watch' ? 'yellow' : 'red';

  return (
    <div className="card-sunken cl-rise" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="mono" style={labelStyle}>
        Home eligibility
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            className="display"
            style={{ fontSize: 72, lineHeight: 0.86, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}
          >
            {scoreResult.overall}
          </span>
          <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>/ 100</span>
        </span>
        <span style={{ marginBottom: 4 }}>
          <BandPill band={scoreResult.band} large />
        </span>
      </div>
      <ScoreMeter score={scoreResult.overall} tone={overallTone} height={6} />

      {/* Composition: overall = 0.50·A + 0.20·B + 0.30·C — the visual "why 86" */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {scoreResult.gates.map((g) => (
          <div
            key={g.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '7px 9px',
              border: '0.5px solid var(--border)',
              borderRadius: 10,
              background: 'var(--card)',
            }}
          >
            <span className="mono" style={{ fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '0.05em' }}>
              GATE {g.id}
            </span>
            <span className="mono" style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--ink)' }}>
              {g.score}
              <span style={{ fontSize: '0.58rem', color: 'var(--muted)', marginLeft: 4 }}>
                × {g.weight.toFixed(2)}
              </span>
            </span>
            <ScoreMeter score={g.score} tone={GATE_TONE[g.status]} height={3} />
          </div>
        ))}
      </div>

      {/* Red-flag banner (admit case) — names the red flag(s) from the engine */}
      {admit && scoreResult.red_flags.length > 0 && (
        <div
          className="tier-red"
          style={{
            border: '0.5px solid var(--admit-text)',
            borderRadius: 'var(--radius-card)',
            padding: '8px 11px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
          role="alert"
        >
          <div className="mono" style={{ fontSize: '0.66rem', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true">▲</span> Red flag
          </div>
          {scoreResult.red_flags.map((f) => (
            <div key={f.code} className="mono" style={{ fontSize: '0.78rem' }}>
              {f.label}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mono"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          color: 'var(--slate-text)',
          fontSize: '0.72rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        Confidence · {c.level} · {pct(c.completeness)} complete
      </button>

      {open && (
        <div
          className="card"
          style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 11 }}
        >
          <ConfidenceRow label="completeness" value={pct(c.completeness)} />
          <ConfidenceRow label="model certainty" value={pct(c.model_certainty)} sim />
          <ConfidenceRow label="case similarity" value={`n = ${c.case_similarity_n}`} sim />
        </div>
      )}
    </div>
  );
}

function ConfidenceRow({ label, value, sim }: { label: string; value: string; sim?: boolean }) {
  return (
    <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
      <span style={{ color: 'var(--muted)' }}>
        {label}
        {sim && <span style={{ fontSize: '0.6rem', marginLeft: 6, opacity: 0.7 }}>(simulated)</span>}
      </span>
      <span style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}

// =============================================================================
// Gate rows (4)
// =============================================================================

function GateRow({ gate, defaultOpen }: { gate: Gate; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          background: open ? 'var(--card)' : 'transparent',
          border: 'none',
          padding: '11px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          textAlign: 'left',
          transition: 'background var(--dur-fast) var(--ease-out)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <span
            className={`${GATE_STATUS_CLASS[gate.status]}`}
            aria-hidden="true"
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              flexShrink: 0,
            }}
          >
            {GATE_STATUS_ICON[gate.status]}
          </span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span className="mono" style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '0.06em' }}>
              Gate {gate.id} · weight {gate.weight.toFixed(2)}
            </span>
            <span style={{ fontSize: '0.88rem', color: 'var(--ink)' }}>{gate.label}</span>
          </span>
          <span
            className="mono"
            style={{ fontSize: '1.05rem', fontWeight: 500, color: 'var(--ink)', fontVariant: 'tabular-nums' }}
          >
            {gate.score}
          </span>
          <span aria-hidden="true" className="mono" style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
            {open ? '▾' : '▸'}
          </span>
        </span>
        <ScoreMeter score={gate.score} tone={GATE_TONE[gate.status]} />
      </button>

      {open && (
        <div style={{ borderTop: '0.5px solid var(--border)' }}>
          {gate.contributions.map((c, i) => (
            <ContributionRow key={`${c.field}-${i}`} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function fmtValue(v: Contribution['value']): string {
  if (v === null) return 'not stated';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

function valueLabel(c: Contribution): string {
  const v = fmtValue(c.value);
  return c.unit && typeof c.value === 'number' ? `${v}${c.unit === '%' || c.unit === '°C' ? '' : ' '}${c.unit}` : v;
}

function ContributionRow({ c }: { c: Contribution }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderTop: '0.5px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* signal name + measured value + status */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--ink)', fontWeight: 500 }}>{c.label}</span>
        <span className="mono" style={{ fontSize: '0.82rem', color: 'var(--slate-text)' }}>
          {valueLabel(c)}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <StatusChip status={c.status} />
          {c.weight > 0 && (
            <span className="mono" style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>
              {c.points} pts · w {c.weight.toFixed(2)}
            </span>
          )}
        </span>
      </div>

      {/* the threshold ladder — where the value sits across in/borderline/out */}
      <ThresholdLadder range={c.range} status={c.status} valueLabel={valueLabel(c)} />

      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.45 }}>{c.note}</div>
    </div>
  );
}

// =============================================================================
// Reasoning panel (5)
// =============================================================================

function ReasoningPanel({ scoreResult }: { scoreResult: ScoreResult }) {
  return (
    <div
      style={{
        background: 'var(--slate-fill)',
        border: '0.5px solid var(--slate)',
        borderRadius: 'var(--radius-card)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
      }}
    >
      <div className="mono" style={labelStyle}>
        Why this recommendation
      </div>
      <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--ink)' }}>
        {scoreResult.rationale}
      </p>
    </div>
  );
}

// =============================================================================
// Action row (6) — EQUAL WEIGHT, two identical outline buttons
// =============================================================================

const RECOMMENDATION: Record<ScoreResult['band'], string> = {
  eligible: 'Recommendation: home management',
  watch: 'Recommendation: home with conditions',
  admit: 'Recommendation: admit',
};

function ActionRow({
  scoreResult,
  onDecideHome,
  onDecideAdmit,
  decisionLog,
  decision,
}: {
  scoreResult: ScoreResult;
  onDecideHome: () => void;
  onDecideAdmit: () => void;
  decisionLog: string | null;
  decision: Decision | null;
}) {
  const locked = decision !== null;
  // Labels follow the recommendation: the disposition the engine recommends is
  // the "Accept" action; the other is an "Override". Both stay equal weight, and
  // the admit/home button positions are fixed (admit left, home right).
  const admitRecommended = scoreResult.band === 'admit';
  const admitLabel = admitRecommended ? 'Accept admission' : 'Override to admit';
  const homeLabel = admitRecommended ? 'Override to home' : 'Accept & hand off';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--ink)' }}>
        {RECOMMENDATION[scoreResult.band]}
      </span>

      {/* Two IDENTICAL buttons (iron rule: equal weight, neither filled/colored).
          Left = admit disposition, right = home disposition. */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn-action"
          onClick={onDecideAdmit}
          disabled={locked}
          aria-pressed={decision === 'admit'}
        >
          {decision === 'admit' && <span aria-hidden="true">✓</span>}
          {admitLabel}
        </button>
        <button
          className="btn-action"
          onClick={onDecideHome}
          disabled={locked}
          aria-pressed={decision === 'home'}
        >
          {decision === 'home' && <span aria-hidden="true">✓</span>}
          {homeLabel}
        </button>
      </div>

      {decisionLog && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            paddingTop: 2,
          }}
        >
          <span
            className="mono"
            style={{ fontSize: '0.72rem', color: 'var(--slate-text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            role="status"
          >
            <span aria-hidden="true">✓</span>
            {decisionLog}
          </span>
          {locked && (
            <span className="mono" style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>
              decision locked · reset to change
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Trust footer (7)
// =============================================================================

function TrustFooter() {
  return (
    <div
      className="card-sunken mono"
      style={{
        textAlign: 'center',
        fontSize: '0.72rem',
        color: 'var(--muted)',
        padding: '9px 11px',
      }}
    >
      Decision support · the physician decides
    </div>
  );
}

// =============================================================================
// TriageView (composition)
// =============================================================================

export default function TriageView({
  packets,
  selectedPacketId,
  record,
  scoreResult,
  extracting,
  source,
  onSelectPacket,
  onDecideHome,
  onDecideAdmit,
  decisionLog,
  decision,
  onExtractCustom,
  customError,
  liveAvailable,
  isCustom,
}: TriageViewProps) {
  // The gate with the dominant deduction defaults open (PRD §4.4).
  const dominantGateId = scoreResult
    ? scoreResult.gates.find((g) =>
        g.contributions.some((c) => c.field === scoreResult.dominant_signal),
      )?.id
    : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <EhrChrome />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 290px) 1fr',
          gap: 14,
          alignItems: 'start',
        }}
      >
        {/* Left rail — packet intake */}
        <PacketRail
          packets={packets}
          selectedPacketId={selectedPacketId}
          onSelectPacket={onSelectPacket}
          isCustom={isCustom}
          onExtractCustom={onExtractCustom}
          customError={customError}
          liveAvailable={liveAvailable}
        />

        {/* Right column — AI intake + score + gates + reasoning + actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AiIntakePanel record={record} extracting={extracting} source={source} />

          {!scoreResult ? (
            <div
              className="card-sunken"
              style={{ fontSize: '0.86rem', color: 'var(--muted)', textAlign: 'center', padding: 22 }}
            >
              {extracting
                ? 'Scoring once intake completes…'
                : 'Select a packet to compute home eligibility.'}
            </div>
          ) : (
            <>
              <ScoreCard scoreResult={scoreResult} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scoreResult.gates.map((g) => (
                  <GateRow key={g.id} gate={g} defaultOpen={g.id === dominantGateId} />
                ))}
              </div>

              <ReasoningPanel scoreResult={scoreResult} />

              <ActionRow
                scoreResult={scoreResult}
                onDecideHome={onDecideHome}
                onDecideAdmit={onDecideAdmit}
                decisionLog={decisionLog}
                decision={decision}
              />
            </>
          )}

          <TrustFooter />
        </div>
      </div>
    </div>
  );
}
