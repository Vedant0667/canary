// Canned 5-day home-monitoring series for Mrs. R.
// Source of truth: careloop-scoring-spec.md §12 (day, weight_lb, spo2_pct, hr_bpm).
// Day 4 is the demo moment: trend composite fires Yellow while every absolute
// value is still individually in-range. Day 5 = post-intervention reversal.
import type { Reading } from '../types';

export const MRS_R_SERIES: Reading[] = [
  { day: 1, weight_lb: 148.0, spo2_pct: 95, hr_bpm: 78 },
  { day: 2, weight_lb: 148.2, spo2_pct: 95, hr_bpm: 77 },
  { day: 3, weight_lb: 149.5, spo2_pct: 94, hr_bpm: 82 },
  { day: 4, weight_lb: 151.4, spo2_pct: 93, hr_bpm: 89 },
  { day: 5, weight_lb: 150.1, spo2_pct: 94, hr_bpm: 83 },
];
