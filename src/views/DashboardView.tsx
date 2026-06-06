// View ③ — Coordinator dashboard (the payoff). PRD §4 View 3.
// Pure renderer: consumes Reading[] + TierResult[] passed as props. The engine
// computes tiers (assessTrend); this view NEVER computes clinically — it only
// renders deltas/tiers it is handed and derives display numbers from them.

import { useEffect, useState } from 'react';
import type { Reading, Tier, TierResult, Dyspnea } from '../types';
import { Chip, TierDot } from '../components/primitives';
import {
  ADMITTED_INDEX,
  SENT_HOME_INDEX,
  HOME_START_INDEX,
} from '../data/monitoring';
import type { TimelinePoint } from '../data/monitoring';

// Which day-4 intervention the coordinator took (null = none yet). Either choice
// resolves the episode and reveals the day-5 recovery.
export type Intervention = 'telehealth' | 'physician';

export interface DashboardViewProps {
  day: number; // 1..5, current revealed day
  readings: Reading[]; // full 5-day home series; render only up to `day`
  timeline: TimelinePoint[]; // full hospital→home arc for the charts
  patientName: string; // current patient (roster + alert), not hardcoded
  patientMrn: string;
  tierByDay: TierResult[]; // assessTrend per revealed day (index 0 = day 1)
  symptomByDay: Record<number, Dyspnea>; // provider's daily symptom report (day → status)
  onReportSymptom: (day: number, symptom: Dyspnea) => void;
  onAdvanceDay: () => void;
  onTelehealth: () => void; // day-4 action → reveals day-5 reversal
  onNotifyPhysician: () => void; // day-4 alternative → physician-led day-5 reversal
  intervention: Intervention | null;
}

// Baseline = mean of days 1–2 per signal (spec §12). Pure read of the series.
function baselineMean(readings: Reading[], key: 'weight_lb' | 'spo2_pct' | 'hr_bpm') {
  const base = readings.slice(0, 2);
  if (base.length === 0) return 0;
  return base.reduce((s, r) => s + r[key], 0) / base.length;
}

// Format a signed delta as mono copy, e.g. +3.3 / −2.
function signed(n: number, digits = 0) {
  const r = digits ? Number(n.toFixed(digits)) : Math.round(n);
  const sign = r > 0 ? '+' : r < 0 ? '−' : '';
  return `${sign}${Math.abs(r).toFixed(digits)}`;
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: '0.68rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

// Daily symptom check-in options (reuse the triage dyspnea vocabulary).
const SYMPTOM_OPTIONS: { value: Dyspnea; label: string }[] = [
  { value: 'none', label: 'No symptoms' },
  { value: 'exertional', label: 'On exertion' },
  { value: 'at_rest', label: 'At rest' },
];
const SYMPTOM_LABEL: Record<Dyspnea, string> = {
  none: 'no symptoms',
  exertional: 'exertional',
  at_rest: 'at rest',
};

export default function DashboardView({
  day,
  readings,
  timeline,
  patientName,
  patientMrn,
  tierByDay,
  symptomByDay,
  onReportSymptom,
  onAdvanceDay,
  onTelehealth,
  onNotifyPhysician,
  intervention,
}: DashboardViewProps) {
  const resolved = intervention !== null;
  const revealed = readings.slice(0, day);
  const latestReading = revealed[revealed.length - 1];
  const currentTier: Tier = tierByDay[day - 1]?.tier ?? 'green';

  // Live metric counts driven purely by the current tier (PRD §4.1).
  const counts: Record<Tier, number> = {
    green: currentTier === 'green' ? 1 : 0,
    yellow: currentTier === 'yellow' ? 1 : 0,
    red: currentTier === 'red' ? 1 : 0,
  };

  // Baselines + the trend thresholds that define the "no-alarm" band (spec §12:
  // yellow needs Δweight ≥ +3 AND SpO₂ ≤ −2 / HR ≥ +10). The shaded band is that
  // still-unalarming envelope around the days 1–2 mean.
  const wBase = baselineMean(readings, 'weight_lb');
  const sBase = baselineMean(readings, 'spo2_pct');
  const hBase = baselineMean(readings, 'hr_bpm');

  // Day-4 alert numbers derived from the engine's TierResult, never hardcoded.
  const day4 = tierByDay[3];
  const showAlert = day >= 4 && currentTier === 'yellow' && !!day4;
  // The per-vital "within range" proof comes straight from the engine's own
  // flags (day4.{weight,spo2,hr}_in_range) — the view never re-derives a
  // clinical verdict.

  // Closing banner after an intervention is taken and day 5 reveals recovery.
  const showClose = resolved && day >= 5 && currentTier === 'green';

  const canAdvance = day < readings.length;

  // --- Full trajectory (hospital → discharge → home) for the charts ---------
  // Hospital points are always shown; home points reveal with `day`.
  const revealedCount = HOME_START_INDEX + day;
  const fullLen = timeline.length;
  const points = timeline.slice(0, revealedCount);
  const dayFourIndex = HOME_START_INDEX + 3; // home day 4

  // Clickable point selection, synchronized across the three charts. Following the
  // latest revealed day by default; a click pins it until the next Advance.
  const [pinned, setPinned] = useState<number | null>(null);
  useEffect(() => setPinned(null), [day]); // advancing day re-follows the latest point
  const selectedIndex = pinned != null && pinned < revealedCount ? pinned : revealedCount - 1;
  const selectedPoint = timeline[selectedIndex];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Day-4 trajectory alert — surfaced to the very top (PRD §4.4). */}
      {showAlert && latestReading && (
        <section
          className="card cl-rise"
          role="alert"
          style={{
            border: '0.5px solid var(--watch-text)',
            background: 'var(--watch-bg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Chip tone="yellow">◆ Trajectory alert</Chip>
            <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--watch-text)' }}>
              {patientName} · day {day} · forecast: rising 24–48h decompensation risk
            </span>
          </div>

          {/* Focal verdict — the converging trend as a Fraunces headline number. */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span
              className="display"
              style={{ fontSize: '2.4rem', lineHeight: 1, color: 'var(--watch-text)' }}
            >
              {signed(day4.weight_delta_vs_baseline, 1)} lb
            </span>
            <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--watch-text)' }}>
              weight vs days 1–2 baseline · SpO₂ {signed(day4.spo2_delta_vs_baseline)} · HR{' '}
              {signed(day4.hr_delta_vs_baseline)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--ink)' }}>
            Three signals are converging at once — yet every individual vital is still inside its
            alarm threshold:
          </p>

          {/* Threshold proof — each tracked vital against its hard alarm line.
              Each "within range" verdict comes from the engine's own per-vital
              flag (weight_in_range / spo2_in_range / hr_in_range), independently
              derived — never re-computed here (pure renderer). */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <AlarmCheck
              label="Weight Δ vs base"
              value={`${signed(day4.weight_delta_vs_baseline, 1)} lb`}
              alarm="alarm at ≥ +5 lb"
              ok={day4.weight_in_range}
            />
            <AlarmCheck
              label="SpO₂"
              value={`${latestReading.spo2_pct}%`}
              alarm="alarm at < 92%"
              ok={day4.spo2_in_range}
            />
            <AlarmCheck
              label="Heart rate"
              value={`${latestReading.hr_bpm} bpm`}
              alarm="alarm at > 130"
              ok={day4.hr_in_range}
            />
          </div>

          <p className="mono" style={{ margin: 0, fontSize: '0.76rem', color: 'var(--watch-text)' }}>
            ◆ No single-threshold alarm would have fired yet — this is forecast, not alert.
          </p>

          {/* EQUAL-WEIGHT actions (iron rule): identical buttons. Either one
              resolves the episode and reveals the day-5 recovery. */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-action" onClick={onTelehealth} disabled={resolved}>
              {intervention === 'telehealth' ? '✓ Telehealth scheduled' : 'Schedule telehealth'}
            </button>
            <button className="btn-action" onClick={onNotifyPhysician} disabled={resolved}>
              {intervention === 'physician' ? '✓ Physician notified' : 'Notify physician'}
            </button>
          </div>
        </section>
      )}

      {/* Closing banner (PRD §4.5) — the payoff. Copy reflects the action taken. */}
      {showClose && (
        <section
          className="card cl-rise"
          style={{
            border: '0.5px solid var(--pass-text)',
            background: 'var(--pass-bg)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Chip tone="green">● Resolved at home</Chip>
          <span className="mono" style={{ fontSize: '0.82rem', color: 'var(--pass-text)' }}>
            {intervention === 'physician'
              ? 'Physician notified on day 4 — acted before any alarm'
              : 'Telehealth scheduled on day 4 — acted before any alarm'}
          </span>
          <span className="mono" style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
            Bed-days used: 0 · Readmission: none · Studies re-run: 0
          </span>
        </section>
      )}

      {/* Header. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h2 className="display" style={{ margin: 0, fontSize: '1.4rem' }}>
          Home monitoring
        </h2>
        <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
          Coordinator dashboard · day {day} of {readings.length}
        </span>
      </div>

      {/* Metric cards (PRD §4.1) — live-update with the current tier. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <MetricCard label="Home-managed" value={counts.green} tier="green" active={currentTier === 'green'} />
        <MetricCard label="Watch" value={counts.yellow} tier="yellow" active={currentTier === 'yellow'} />
        <MetricCard label="Admit-prompted" value={counts.red} tier="red" active={currentTier === 'red'} />
      </div>

      {/* Roster (PRD §4.2). */}
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={SECTION_LABEL} className="mono">
          Roster
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120 }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{patientName}</span>
            <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              CHF · MRN {patientMrn}
            </span>
          </div>
          <TierDot tier={currentTier} />
          {latestReading && (
            <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
              {latestReading.weight_lb.toFixed(1)} lb · SpO₂ {latestReading.spo2_pct} · HR{' '}
              {latestReading.hr_bpm}
            </span>
          )}
        </div>

        {/* Selected-day readout — updates as you click any point (synchronized). */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            padding: '8px 11px',
            borderRadius: 10,
            background: selectedPoint.phase === 'hospital' ? 'var(--slate-fill)' : 'var(--card)',
            border: '0.5px solid var(--border)',
          }}
        >
          <span
            className="mono"
            style={{ fontSize: '0.72rem', color: selectedPoint.phase === 'hospital' ? 'var(--slate-text)' : 'var(--ink)', minWidth: 168 }}
          >
            {selectedPoint.full}
          </span>
          <Readout label="Weight" value={`${selectedPoint.weight_lb.toFixed(1)} lb`} />
          <Readout label="SpO₂" value={`${selectedPoint.spo2_pct}%`} />
          <Readout label="HR" value={`${selectedPoint.hr_bpm} bpm`} />
        </div>

        {/* Three trend charts — full hospital → home arc, clickable, with admitted
            and sent-home reference lines and the home-baseline band (PRD §4.2/§4.3). */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <TrendChart
            title="Weight"
            unit="lb"
            metric="weight_lb"
            points={points}
            timeline={timeline}
            fullLen={fullLen}
            baseline={wBase}
            margin={3}
            dayFourIndex={dayFourIndex}
            selectedIndex={selectedIndex}
            onSelect={setPinned}
            decimals={1}
          />
          <TrendChart
            title="SpO₂"
            unit="%"
            metric="spo2_pct"
            points={points}
            timeline={timeline}
            fullLen={fullLen}
            baseline={sBase}
            margin={2}
            dayFourIndex={dayFourIndex}
            selectedIndex={selectedIndex}
            onSelect={setPinned}
          />
          <TrendChart
            title="Heart rate"
            unit="bpm"
            metric="hr_bpm"
            points={points}
            timeline={timeline}
            fullLen={fullLen}
            baseline={hBase}
            margin={10}
            dayFourIndex={dayFourIndex}
            selectedIndex={selectedIndex}
            onSelect={setPinned}
          />
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Legend swatch={<MarkerSwatch />} label="admitted · sent home" />
          <Legend swatch={<span style={{ width: 9, height: 10, background: 'var(--slate-chip)', borderRadius: 2, display: 'inline-block' }} />} label="selected day" />
          <Legend swatch={<span style={{ width: 14, height: 8, background: 'var(--slate-fill)', borderRadius: 2, display: 'inline-block' }} />} label="hospital phase" />
          <Legend swatch={<span className="mono" style={{ fontSize: '0.7rem', color: 'var(--slate)' }}>●</span>} label="home" />
          <Legend swatch={<span style={{ width: 14, height: 8, background: 'var(--pass-bg)', borderRadius: 2, display: 'inline-block' }} />} label="days 1–2 baseline band" />
        </div>
      </section>

      {/* Daily symptom check-in — the home-care provider reports symptoms each day.
          The answer feeds the engine's trend tier (assessTrend), so symptoms can
          escalate a day even when every tracked vital is still in range. */}
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={SECTION_LABEL} className="mono">
          Daily symptom check-in
        </div>
        <div style={{ fontSize: '0.92rem', color: 'var(--ink)', lineHeight: 1.4 }}>
          Day {day}: is {patientName} short of breath or symptomatic today?
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {SYMPTOM_OPTIONS.map((opt) => {
            const sel = (symptomByDay[day] ?? null) === opt.value;
            return (
              <button
                key={opt.value}
                className="btn-action"
                aria-pressed={sel}
                onClick={() => onReportSymptom(day, opt.value)}
              >
                {sel && <span aria-hidden="true">✓ </span>}
                {opt.label}
              </button>
            );
          })}
        </div>
        {symptomByDay[day] != null ? (
          <span
            className="mono"
            role="status"
            style={{ fontSize: '0.74rem', color: TIER_TEXT[currentTier], display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <TierDot tier={currentTier} showWord={false} />
            Recorded for day {day} · today’s tier is {currentTier.toUpperCase()}
            {tierByDay[day - 1] ? ` — ${tierByDay[day - 1].reason}` : ''}
          </span>
        ) : (
          <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            Not yet reported for day {day} — today’s tier reflects vitals only until you answer.
          </span>
        )}
        {/* Prior days' recorded answers */}
        {day > 1 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
            {Array.from({ length: day - 1 }, (_, i) => i + 1).map((d) => (
              <span
                key={d}
                className="mono"
                style={{ fontSize: '0.64rem', color: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '2px 8px' }}
              >
                d{d}: {symptomByDay[d] != null ? SYMPTOM_LABEL[symptomByDay[d]] : 'not reported'}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Day stepper (PRD §4.3) — the demo driver. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onAdvanceDay} disabled={!canAdvance} className="btn-primary">
          {canAdvance ? 'Advance day ▸' : 'End of series'}
        </button>
        <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
          {revealed.map((r) => `d${r.day}`).join(' · ')}
        </span>
      </div>
    </div>
  );
}

const TIER_BG: Record<Tier, string> = {
  green: 'var(--pass-bg)',
  yellow: 'var(--watch-bg)',
  red: 'var(--admit-bg)',
};
const TIER_TEXT: Record<Tier, string> = {
  green: 'var(--pass-text)',
  yellow: 'var(--watch-text)',
  red: 'var(--admit-text)',
};

function AlarmCheck({
  label,
  value,
  alarm,
  ok,
}: {
  label: string;
  value: string;
  alarm: string;
  ok: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '8px 10px',
        borderRadius: 10,
        background: 'var(--card)',
        border: '0.5px solid var(--border)',
      }}
    >
      <span className="mono" style={{ fontSize: '0.58rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="mono" style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--ink)' }}>
        {value}
      </span>
      <span
        className="mono"
        style={{ fontSize: '0.62rem', color: ok ? 'var(--pass-text)' : 'var(--admit-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <span aria-hidden="true">{ok ? '✓' : '▲'}</span>
        {ok ? 'within range' : 'breached'} · {alarm}
      </span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tier,
  active,
}: {
  label: string;
  value: number;
  tier: Tier;
  active: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: active ? TIER_BG[tier] : 'var(--card)',
        borderColor: active ? TIER_TEXT[tier] : 'var(--border)',
        transition: 'background var(--dur) var(--ease-out), border-color var(--dur) var(--ease-out)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={SECTION_LABEL} className="mono">
          {label}
        </span>
        <TierDot tier={tier} showWord={false} />
      </div>
      <span
        className="display"
        style={{ fontSize: '2.4rem', lineHeight: 1, color: active ? TIER_TEXT[tier] : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  );
}

type Metric = 'weight_lb' | 'spo2_pct' | 'hr_bpm';

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
      <span className="mono" style={{ fontSize: '0.54rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="display" style={{ fontSize: '1.18rem', lineHeight: 1, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </span>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {swatch}
      <span className="mono" style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>
        {label}
      </span>
    </span>
  );
}

function MarkerSwatch() {
  return (
    <svg width="12" height="12" aria-hidden="true">
      <line x1="6" y1="0" x2="6" y2="12" stroke="var(--ink)" strokeWidth="0.75" strokeDasharray="3 3" opacity={0.55} />
    </svg>
  );
}

// Interactive trend chart: full hospital→home arc, clickable points, admitted /
// sent-home reference lines, and the home-baseline band. Y-axis is scaled over the
// FULL timeline so it stays stable as days reveal.
function TrendChart({
  title,
  unit,
  metric,
  points,
  timeline,
  fullLen,
  baseline,
  margin,
  dayFourIndex,
  selectedIndex,
  onSelect,
  decimals = 0,
}: {
  title: string;
  unit: string;
  metric: Metric;
  points: TimelinePoint[];
  timeline: TimelinePoint[]; // full arc — for a stable y-scale as days reveal
  fullLen: number;
  baseline: number;
  margin: number;
  dayFourIndex: number;
  selectedIndex: number;
  onSelect: (i: number) => void;
  decimals?: number;
}) {
  const W = 340;
  const H = 122;
  const padL = 12;
  const padR = 12;
  const padT = 18;
  const padB = 20;
  const plotW = W - padL - padR;
  const plotTop = padT;
  const plotBottom = H - padB;

  // Stable Y scale over the whole timeline + the baseline band edges.
  const all = timeline.map((p) => p[metric]);
  const lo = Math.min(...all, baseline - margin);
  const hi = Math.max(...all, baseline + margin);
  const pad = (hi - lo) * 0.12 || 1;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const x = (i: number) => padL + (fullLen === 1 ? plotW / 2 : (i / (fullLen - 1)) * plotW);
  const y = (v: number) => plotBottom - ((v - yMin) / (yMax - yMin)) * (plotBottom - plotTop);

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[metric]).toFixed(1)}`)
    .join(' ');

  const selVal = points[selectedIndex]?.[metric];

  return (
    <div className="card-sunken" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
          {title}
        </span>
        <span className="mono" style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--ink)' }}>
          {selVal != null ? `${selVal.toFixed(decimals)} ${unit}` : '—'}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`${title} trend, hospital through home`}>
        {/* hospital-phase shading — the inpatient stay reads as a quiet slate field */}
        <rect x={x(0)} y={plotTop} width={x(SENT_HOME_INDEX) - x(0)} height={plotBottom - plotTop} fill="var(--slate-fill)" opacity={0.7} />

        {/* home baseline band (days 1–2 ± trend margin) */}
        <rect
          x={x(HOME_START_INDEX)}
          y={y(baseline + margin)}
          width={x(fullLen - 1) - x(HOME_START_INDEX)}
          height={Math.max(0, y(baseline - margin) - y(baseline + margin))}
          fill="var(--pass-bg)"
          opacity={0.55}
        />

        {/* selected-day indicator — a soft slate band, distinct from the dashed
            reference lines so the pinned day is unmistakable. Drawn first (under). */}
        <rect
          x={x(selectedIndex) - 4.5}
          y={plotTop}
          width={9}
          height={plotBottom - plotTop}
          rx={2}
          fill="var(--slate-chip)"
          opacity={0.7}
        />

        {/* reference lines: admitted + sent home */}
        {[
          { i: ADMITTED_INDEX, label: 'admitted' },
          { i: SENT_HOME_INDEX, label: 'sent home' },
        ].map((m) => (
          <g key={m.label}>
            <line x1={x(m.i)} y1={plotTop - 5} x2={x(m.i)} y2={plotBottom} stroke="var(--ink)" strokeWidth={0.75} strokeDasharray="3 3" opacity={0.55} />
            <text x={x(m.i)} y={plotTop - 8} textAnchor={m.i === ADMITTED_INDEX ? 'start' : 'middle'} className="mono" fontSize={8} fill="var(--muted)" letterSpacing="0.02em">
              {m.label}
            </text>
          </g>
        ))}

        {/* trend line */}
        <path d={line} fill="none" stroke="var(--slate)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />

        {/* x-axis labels */}
        {points.map((p, i) => (
          <text key={`lbl-${p.t}`} x={x(i)} y={H - 6} textAnchor="middle" className="mono" fontSize={7} fill="var(--muted)">
            {p.label}
          </text>
        ))}

        {/* points + hit targets */}
        {points.map((p, i) => {
          const cx = x(i);
          const cy = y(p[metric]);
          const isHome = p.phase === 'home';
          const isDay4 = p.t === dayFourIndex;
          const isSel = i === selectedIndex;
          return (
            <g key={`pt-${p.t}`} style={{ cursor: 'pointer' }} onClick={() => onSelect(i)}>
              {isSel && (
                <>
                  <circle cx={cx} cy={cy} r={6} fill="var(--card)" stroke="var(--slate)" strokeWidth={1.25} />
                </>
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isDay4 ? 3.6 : 2.6}
                fill={isDay4 ? 'var(--watch-text)' : isHome ? 'var(--slate)' : 'var(--card)'}
                stroke={isHome || isDay4 ? 'none' : 'var(--muted)'}
                strokeWidth={1}
              />
              <circle cx={cx} cy={cy} r={12} fill="transparent">
                <title>{`${p.full}: ${p[metric].toFixed(decimals)} ${unit}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
