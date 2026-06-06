// Canned monitoring data for Mrs. R.
//
// MRS_R_SERIES — the 5-day HOME series (scoring-spec §12). Drives the trend tier
// logic (assessTrend); day 4 is the demo moment (composite Yellow while every
// absolute value is still in range). DO NOT change these values — the engine and
// the day-4 alert depend on them.
//
// MRS_R_TIMELINE — the FULL trajectory for the dashboard charts: the hospital
// admission → diuresis → discharge arc, then the same 5 home days. Visualization
// only; the tier logic still runs on the home subset.
import type { PatientRecord, Reading } from '../types';

export const MRS_R_SERIES: Reading[] = [
  { day: 1, weight_lb: 148.0, spo2_pct: 95, hr_bpm: 78 },
  { day: 2, weight_lb: 148.2, spo2_pct: 95, hr_bpm: 77 },
  { day: 3, weight_lb: 149.5, spo2_pct: 94, hr_bpm: 82 },
  { day: 4, weight_lb: 151.4, spo2_pct: 93, hr_bpm: 89 },
  { day: 5, weight_lb: 150.1, spo2_pct: 94, hr_bpm: 83 },
];

export type Phase = 'hospital' | 'home';

export interface TimelinePoint {
  t: number; // 0-based position on the full timeline
  label: string; // short axis label, e.g. "H1", "Adm", "D1"
  full: string; // full label for the readout, e.g. "Hospital day 1"
  phase: Phase;
  weight_lb: number;
  spo2_pct: number;
  hr_bpm: number;
}

// Hospital phase: admitted with decompensated CHF (fluid-overloaded, hypoxic,
// tachycardic), diuresed over four days down to a stable discharge baseline that
// hands off to home day 1.
export const MRS_R_TIMELINE: TimelinePoint[] = [
  { t: 0, label: 'Adm', full: 'Hospital · admission', phase: 'hospital', weight_lb: 159.0, spo2_pct: 88, hr_bpm: 106 },
  { t: 1, label: 'H2', full: 'Hospital · day 2', phase: 'hospital', weight_lb: 155.2, spo2_pct: 90, hr_bpm: 99 },
  { t: 2, label: 'H3', full: 'Hospital · day 3', phase: 'hospital', weight_lb: 151.6, spo2_pct: 92, hr_bpm: 90 },
  { t: 3, label: 'H4', full: 'Hospital · day 4', phase: 'hospital', weight_lb: 149.2, spo2_pct: 94, hr_bpm: 83 },
  // Home — same values as MRS_R_SERIES. Index 4 is the discharge / sent-home day.
  { t: 4, label: 'D1', full: 'Home · day 1 (discharge)', phase: 'home', weight_lb: 148.0, spo2_pct: 95, hr_bpm: 78 },
  { t: 5, label: 'D2', full: 'Home · day 2', phase: 'home', weight_lb: 148.2, spo2_pct: 95, hr_bpm: 77 },
  { t: 6, label: 'D3', full: 'Home · day 3', phase: 'home', weight_lb: 149.5, spo2_pct: 94, hr_bpm: 82 },
  { t: 7, label: 'D4', full: 'Home · day 4', phase: 'home', weight_lb: 151.4, spo2_pct: 93, hr_bpm: 89 },
  { t: 8, label: 'D5', full: 'Home · day 5', phase: 'home', weight_lb: 150.1, spo2_pct: 94, hr_bpm: 83 },
];

// Reference markers (timeline indices). The synthesized trajectory below uses the
// same 4-hospital + 5-home layout, so these indices hold for every patient.
export const ADMITTED_INDEX = 0; // admission
export const HOME_START_INDEX = 4; // first home day
export const SENT_HOME_INDEX = 4; // discharge / sent-home day = home day 1

// ---------------------------------------------------------------------------
// Per-patient trajectory synthesis.
// ---------------------------------------------------------------------------
//
// There is no real device telemetry, so for any patient OTHER than Mrs. R (who
// ships a hand-authored series) we fabricate a plausible 5-day home trajectory
// — plus the preceding hospital admission→diuresis arc — from their extracted
// discharge vitals. The day-by-day deltas are borrowed from Mrs. R's archetype
// so the signature day-4 "converging trend" teaching moment reproduces for
// every patient: weight drifting up while SpO₂/HR converge, yet every absolute
// value still inside its alarm threshold (assessTrend → yellow, not red).

const clampN = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

// Relative deltas vs the discharge baseline (= home day 1). Stable through days
// 1–2, converging trend peaking day 4, partial recovery day 5.
const HOME_DELTAS = [
  { w: 0.0, s: 0, h: 0 },
  { w: 0.2, s: 0, h: -1 },
  { w: 1.5, s: -1, h: 4 },
  { w: 3.4, s: -2, h: 11 },
  { w: 2.1, s: -1, h: 5 },
];

// Hospital phase: admitted decompensated, diuresed down to the discharge baseline.
const HOSPITAL_DELTAS = [
  { w: 11.0, s: -7, h: 28 },
  { w: 7.2, s: -5, h: 21 },
  { w: 3.6, s: -3, h: 12 },
  { w: 1.2, s: -1, h: 5 },
];

export function synthesizeTrajectory(record: PatientRecord): {
  series: Reading[];
  timeline: TimelinePoint[];
} {
  const v = record.vitals;
  // Discharge baseline, nudged into a safe in-range start (SpO₂ ≥ 94, HR ≤ 100)
  // so the day-4 trend reads as a forecast (yellow) rather than tripping an
  // absolute alarm. Patients accepted home are generally already in this band.
  const baseW = v.weight_lb ?? 165;
  const baseS = clampN(Math.round(v.spo2_pct ?? 96), 94, 99);
  const baseH = clampN(Math.round(v.hr_bpm ?? 80), 60, 100);

  const series: Reading[] = HOME_DELTAS.map((d, i) => ({
    day: i + 1,
    weight_lb: round1(baseW + d.w),
    spo2_pct: clampN(baseS + d.s, 92, 100), // stay ≥ 92 → in range → yellow not red
    hr_bpm: clampN(baseH + d.h, 40, 129), // stay ≤ 129 → in range
  }));

  const hospital: TimelinePoint[] = HOSPITAL_DELTAS.map((d, i) => ({
    t: i,
    label: i === 0 ? 'Adm' : `H${i + 1}`,
    full: i === 0 ? 'Hospital · admission' : `Hospital · day ${i + 1}`,
    phase: 'hospital',
    weight_lb: round1(baseW + d.w),
    spo2_pct: clampN(baseS + d.s, 80, 100),
    hr_bpm: clampN(baseH + d.h, 40, 160),
  }));

  const home: TimelinePoint[] = series.map((rd, i) => ({
    t: HOME_START_INDEX + i,
    label: `D${i + 1}`,
    full: i === 0 ? 'Home · day 1 (discharge)' : `Home · day ${i + 1}`,
    phase: 'home',
    weight_lb: rd.weight_lb,
    spo2_pct: rd.spo2_pct,
    hr_bpm: rd.hr_bpm,
  }));

  return { series, timeline: [...hospital, ...home] };
}
