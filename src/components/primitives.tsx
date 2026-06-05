// Shared UI primitives that encode CareLoop's iron design rules (PRD §6).
// Centralized so every view renders tiers identically and accessibly:
// a tier is ALWAYS color + icon + word. Consume these; do not re-implement.

import type { ReactNode } from 'react';
import type { Band, SignalStatus, Tier } from '../types';

// --- Tier / band visual metadata -------------------------------------------

interface TierMeta {
  cls: string; // tier-green | tier-yellow | tier-red
  icon: string; // glyph paired with the word for a11y
  word: string;
}

export const BAND_META: Record<Band, TierMeta> = {
  eligible: { cls: 'tier-green', icon: '●', word: 'Eligible' },
  watch: { cls: 'tier-yellow', icon: '◆', word: 'Watch' },
  admit: { cls: 'tier-red', icon: '▲', word: 'Admit' },
};

export const TIER_META: Record<Tier, TierMeta> = {
  green: { cls: 'tier-green', icon: '●', word: 'Stable' },
  yellow: { cls: 'tier-yellow', icon: '◆', word: 'Watch' },
  red: { cls: 'tier-red', icon: '▲', word: 'Alert' },
};

// Band pill for the score card. color + icon + word, always.
export function BandPill({ band, large }: { band: Band; large?: boolean }) {
  const m = BAND_META[band];
  return (
    <span
      className={`pill ${m.cls}`}
      style={large ? { fontSize: '0.92rem', padding: '5px 16px' } : undefined}
      role="status"
      aria-label={`Band: ${m.word}`}
    >
      <span aria-hidden="true">{m.icon}</span>
      {m.word}
    </span>
  );
}

// Tier dot + word for the dashboard roster / metric flips.
export function TierDot({ tier, showWord = true }: { tier: Tier; showWord?: boolean }) {
  const m = TIER_META[tier];
  return (
    <span
      className="mono"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}
      role="status"
      aria-label={`Tier: ${m.word}`}
    >
      <span className={m.cls} aria-hidden="true" style={{ borderRadius: '50%', width: 12, height: 12, display: 'inline-block', lineHeight: '12px', textAlign: 'center', fontSize: 8 }}>
        {m.icon}
      </span>
      {showWord && m.word}
    </span>
  );
}

// --- Generic chips ----------------------------------------------------------

export type ChipTone = 'neutral' | 'slate' | 'green' | 'yellow' | 'red';

const CHIP_STYLES: Record<ChipTone, { color: string; background: string }> = {
  neutral: { color: 'var(--ink)', background: 'var(--slate-fill)' },
  slate: { color: 'var(--slate-text)', background: 'var(--slate-chip)' },
  green: { color: 'var(--pass-text)', background: 'var(--pass-bg)' },
  yellow: { color: 'var(--watch-text)', background: 'var(--watch-bg)' },
  red: { color: 'var(--admit-text)', background: 'var(--admit-bg)' },
};

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: ChipTone }) {
  return (
    <span className="pill" style={CHIP_STYLES[tone]}>
      {children}
    </span>
  );
}

// in/borderline/out range chip for gate contribution rows.
const STATUS_TONE: Record<SignalStatus, ChipTone> = {
  in: 'green',
  borderline: 'yellow',
  out: 'red',
};
const STATUS_WORD: Record<SignalStatus, string> = {
  in: 'in range',
  borderline: 'borderline',
  out: 'out of range',
};
export function StatusChip({ status }: { status: SignalStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{STATUS_WORD[status]}</Chip>;
}

// --- Stepper (top nav) ------------------------------------------------------

export interface Step {
  id: string;
  label: string;
}

export function Stepper({
  steps,
  currentIndex,
  unlockedCount,
  onStep,
}: {
  steps: Step[];
  currentIndex: number;
  unlockedCount: number; // number of steps unlocked (1..steps.length)
  onStep: (index: number) => void;
}) {
  return (
    <nav
      aria-label="Demo steps"
      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
    >
      {steps.map((s, i) => {
        const unlocked = i < unlockedCount;
        const active = i === currentIndex;
        return (
          <button
            key={s.id}
            onClick={() => unlocked && onStep(i)}
            disabled={!unlocked}
            aria-current={active ? 'step' : undefined}
            className="mono"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius-pill)',
              padding: '6px 14px',
              background: active ? 'var(--slate-chip)' : 'var(--card)',
              color: active ? 'var(--slate-text)' : unlocked ? 'var(--ink)' : 'var(--muted)',
              opacity: unlocked ? 1 : 0.5,
              cursor: unlocked ? 'pointer' : 'not-allowed',
              fontSize: '0.8rem',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                background: active ? 'var(--slate)' : 'transparent',
                color: active ? '#fff' : 'inherit',
                border: active ? 'none' : '0.5px solid var(--border)',
              }}
            >
              {i + 1}
            </span>
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}

// --- Sparkline (inline SVG, no chart lib) -----------------------------------

export function Sparkline({
  values,
  width = 96,
  height = 28,
  baseline,
  baselineMargin,
  highlightIndex,
  tone = 'slate',
}: {
  values: number[];
  width?: number;
  height?: number;
  baseline?: number; // draws a shaded baseline band if provided with margin
  baselineMargin?: number;
  highlightIndex?: number; // emphasizes one point (e.g. day 4)
  tone?: ChipTone;
}) {
  if (values.length === 0) return <svg width={width} height={height} />;
  const min = Math.min(...values, ...(baseline != null ? [baseline - (baselineMargin ?? 0)] : []));
  const max = Math.max(...values, ...(baseline != null ? [baseline + (baselineMargin ?? 0)] : []));
  const range = max - min || 1;
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const x = (i: number) => pad + (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w);
  const y = (v: number) => pad + h - ((v - min) / range) * h;
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const stroke = CHIP_STYLES[tone].color;

  return (
    <svg width={width} height={height} role="img" aria-label="trend sparkline">
      {baseline != null && baselineMargin != null && (
        <rect
          x={pad}
          y={y(baseline + baselineMargin)}
          width={w}
          height={Math.max(0, y(baseline - baselineMargin) - y(baseline + baselineMargin))}
          fill="var(--slate-fill)"
        />
      )}
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(v)}
          r={i === highlightIndex ? 2.6 : 1.4}
          fill={i === highlightIndex ? CHIP_STYLES[tone].color : stroke}
        />
      ))}
    </svg>
  );
}
