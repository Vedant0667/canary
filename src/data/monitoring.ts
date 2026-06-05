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
import type { Reading } from '../types';

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

// Reference markers (timeline indices).
export const ADMITTED_INDEX = 0; // admission
export const HOME_START_INDEX = 4; // first home day
export const SENT_HOME_INDEX = 4; // discharge / sent-home day = home day 1
