// View ③ — Coordinator dashboard (the payoff). PRD §4 View 3.
// Pure renderer: consumes Reading[] + TierResult[] passed as props. The engine
// computes tiers (assessTrend); this view NEVER computes clinically — it only
// renders deltas/tiers it is handed and derives display numbers from them.

import type { Reading, Tier, TierResult } from '../types';
import { Chip, Sparkline, TierDot } from '../components/primitives';

export interface DashboardViewProps {
  day: number; // 1..5, current revealed day
  readings: Reading[]; // full 5-day series; render only up to `day`
  tierByDay: TierResult[]; // assessTrend per revealed day (index 0 = day 1)
  onAdvanceDay: () => void;
  onTelehealth: () => void; // day-4 action → reveals day-5 reversal
  telehealthScheduled: boolean;
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

export default function DashboardView({
  day,
  readings,
  tierByDay,
  onAdvanceDay,
  onTelehealth,
  telehealthScheduled,
}: DashboardViewProps) {
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

  const highlight = day >= 4 ? 3 : undefined; // emphasize day-4 point once revealed

  // Day-4 alert numbers derived from the engine's TierResult, never hardcoded.
  const day4 = tierByDay[3];
  const showAlert = day >= 4 && currentTier === 'yellow' && !!day4;

  // Closing banner after telehealth scheduled and day 5 revealed.
  const showClose = telehealthScheduled && day >= 5 && currentTier === 'green';

  const series = (key: 'weight_lb' | 'spo2_pct' | 'hr_bpm') => revealed.map((r) => r[key]);

  const canAdvance = day < readings.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Day-4 trajectory alert — surfaced to the very top (PRD §4.4). */}
      {showAlert && (
        <section
          className="card"
          role="alert"
          style={{ borderLeft: '3px solid var(--watch-text)', display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Chip tone="yellow">◆ Trajectory alert</Chip>
            <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
              Mrs. R · day {day}
            </span>
          </div>
          <p className="mono" style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5 }}>
            Weight {signed(day4.weight_delta_vs_baseline, 1)} lb vs baseline, SpO₂{' '}
            {signed(day4.spo2_delta_vs_baseline)}, HR {signed(day4.hr_delta_vs_baseline)}.{' '}
            {day4.all_values_in_range ? 'No single value out of range.' : ''} Forecast: rising 24–48h
            decompensation risk.
          </p>
          <p className="mono" style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)' }}>
            No threshold alarm would have fired yet.
          </p>
          {/* EQUAL-WEIGHT actions (PRD §6 iron rule): identical outline buttons. */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={onTelehealth} style={outlineBtn} disabled={telehealthScheduled}>
              {telehealthScheduled ? 'Telehealth scheduled' : 'Schedule telehealth'}
            </button>
            <button onClick={() => {}} style={outlineBtn}>
              Notify physician
            </button>
          </div>
        </section>
      )}

      {/* Closing banner (PRD §4.5) — the payoff. */}
      {showClose && (
        <section
          className="card"
          style={{ borderLeft: '3px solid var(--pass-text)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
        >
          <Chip tone="green">● Resolved at home</Chip>
          <span className="mono" style={{ fontSize: '0.88rem' }}>
            Bed-days used: 0 · Readmission: none · Studies re-run: 0
          </span>
        </section>
      )}

      {/* Header. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h2 className="display" style={{ margin: 0, fontSize: '1.4rem', fontWeight: 400 }}>
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
            <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>Mrs. R</span>
            <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              CHF · MRN 4471932
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

        {/* Three sparklines, baseline band shaded (PRD §4.2/§4.3). */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
          <SignalChart
            title="Weight (lb)"
            values={series('weight_lb')}
            latest={latestReading?.weight_lb}
            unit="lb"
            baseline={wBase}
            margin={3}
            highlight={highlight}
            decimals={1}
          />
          <SignalChart
            title="SpO₂ (%)"
            values={series('spo2_pct')}
            latest={latestReading?.spo2_pct}
            unit="%"
            baseline={sBase}
            margin={2}
            highlight={highlight}
          />
          <SignalChart
            title="HR (bpm)"
            values={series('hr_bpm')}
            latest={latestReading?.hr_bpm}
            unit="bpm"
            baseline={hBase}
            margin={10}
            highlight={highlight}
          />
        </div>

        <p className="mono" style={{ margin: 0, fontSize: '0.7rem', color: 'var(--muted)' }}>
          Shaded band: days 1–2 baseline ± trend margin.
        </p>
      </section>

      {/* Day stepper (PRD §4.3). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onAdvanceDay} disabled={!canAdvance} style={{ ...outlineBtn, opacity: canAdvance ? 1 : 0.5, cursor: canAdvance ? 'pointer' : 'not-allowed' }}>
          {canAdvance ? 'Advance day ▸' : 'End of series'}
        </button>
        <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
          {revealed.map((r) => `d${r.day}`).join(' · ')}
        </span>
      </div>
    </div>
  );
}

const outlineBtn: React.CSSProperties = {
  border: '0.5px solid var(--border)',
  borderRadius: 'var(--radius-pill)',
  padding: '7px 18px',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontSize: '0.82rem',
  fontWeight: 500,
};

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
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={SECTION_LABEL} className="mono">
          {label}
        </span>
        <TierDot tier={tier} showWord={false} />
      </div>
      <span
        className="mono"
        style={{ fontSize: '2rem', fontWeight: 500, color: active ? 'var(--ink)' : 'var(--muted)' }}
      >
        {value}
      </span>
    </div>
  );
}

function SignalChart({
  title,
  values,
  latest,
  unit,
  baseline,
  margin,
  highlight,
  decimals = 0,
}: {
  title: string;
  values: number[];
  latest?: number;
  unit: string;
  baseline: number;
  margin: number;
  highlight?: number;
  decimals?: number;
}) {
  return (
    <div className="card-sunken" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
        {title}
      </span>
      <Sparkline
        values={values}
        width={150}
        height={48}
        baseline={baseline}
        baselineMargin={margin}
        highlightIndex={highlight}
      />
      <span className="mono" style={{ fontSize: '0.78rem' }}>
        {latest != null ? `${latest.toFixed(decimals)} ${unit}` : '—'}
      </span>
    </div>
  );
}
