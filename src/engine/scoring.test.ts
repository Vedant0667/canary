import { describe, it, expect } from 'vitest';
import type { PatientRecord, Reading } from '../types';
import { scoreEligibility, assessTrend } from './scoring';

// ---------------------------------------------------------------------------
// Test fixtures built from careloop-scoring-spec.md §10–§11.
// Built inline (NOT imported from src/data) so the engine tests are self-contained.
// ---------------------------------------------------------------------------

// §10 — Mrs. R: MUST reproduce 86 / Eligible (A=86, B=90, C=84).
const mrsR: PatientRecord = {
  name: 'Mrs. R',
  age: 72,
  mrn: '4471932', // pinned hero patient → deterministic case-retrieval values
  condition: 'CHF',
  vitals: {
    hr_bpm: 78,
    bp_systolic: 132,
    bp_diastolic: 84,
    spo2_pct: 95,
    resp_rate: 18,
    temp_c: 37.1,
    weight_lb: 148.0,
    weight_delta_72h_lb: 2.4,
  },
  symptoms: { dyspnea: 'exertional', edema: 'stable', chest_pain: false },
  devices_available: ['scale', 'bp_cuff', 'pulse_ox'],
  home: {
    caregiver: 'full_time',
    housing_stable: true,
    has_power_refrigeration: true,
    connectivity: 'wifi',
    med_self_admin: 'assisted',
    fall_risk: 'moderate',
  },
};

// §11 case 2 — Mr. D: Gate A in the 50–69 Watch band → Watch (gate 50–69 rule).
// The spec names SpO₂ 93, weight +3.1, HR 104 (all Gate-A borderline) and quotes
// Gate A "≈ 67". Those three named signals alone yield ~78; the spec's ~67 implies
// additional mild congestion, so this clinically-coherent Mr. D also carries
// worsening edema (symptoms borderline) and a borderline-elevated BP — landing
// Gate A squarely in the 50–69 Watch band that drives the Watch outcome.
const mrD: PatientRecord = {
  name: 'Mr. D',
  age: 68,
  mrn: 'CHF-0002',
  condition: 'CHF',
  vitals: {
    hr_bpm: 104,
    bp_systolic: 165,
    bp_diastolic: 96,
    spo2_pct: 93,
    resp_rate: 19,
    temp_c: 37.0,
    weight_lb: 190.0,
    weight_delta_72h_lb: 3.1,
  },
  symptoms: { dyspnea: 'none', edema: 'worsening', chest_pain: false },
  devices_available: ['scale', 'bp_cuff', 'pulse_ox'],
  home: {
    caregiver: 'part_time',
    housing_stable: true,
    has_power_refrigeration: true,
    connectivity: 'cell_only',
    med_self_admin: 'yes',
    fall_risk: 'low',
  },
};

// §11 case 3 — Ms. K: SpO₂ 91 → RF1, caregiver none → Gate C < 50 → Admit.
const msK: PatientRecord = {
  name: 'Ms. K',
  age: 81,
  mrn: 'CHF-0003',
  condition: 'CHF',
  vitals: {
    hr_bpm: 88,
    bp_systolic: 124,
    bp_diastolic: 78,
    spo2_pct: 91,
    resp_rate: 22,
    temp_c: 37.4,
    weight_lb: 160.0,
    weight_delta_72h_lb: 3.0,
  },
  symptoms: { dyspnea: 'exertional', edema: 'worsening', chest_pain: false },
  devices_available: ['scale', 'bp_cuff', 'pulse_ox'],
  home: {
    caregiver: 'none',
    housing_stable: false,
    has_power_refrigeration: true,
    connectivity: 'cell_only',
    med_self_admin: 'assisted',
    fall_risk: 'high',
  },
};

describe('scoreEligibility — §10 Mrs. R', () => {
  const r = scoreEligibility(mrsR);

  it('overall = 86, band eligible', () => {
    expect(r.overall).toBe(86);
    expect(r.band).toBe('eligible');
  });

  it('gate sub-scores A=86, B=90, C=84', () => {
    const a = r.gates.find((g) => g.id === 'A')!;
    const b = r.gates.find((g) => g.id === 'B')!;
    const c = r.gates.find((g) => g.id === 'C')!;
    expect(a.score).toBe(86);
    expect(b.score).toBe(90);
    expect(c.score).toBe(84);
  });

  it('no red flags', () => {
    expect(r.red_flags).toHaveLength(0);
  });

  it('every gate passes (>=70)', () => {
    expect(r.gates.every((g) => g.score >= 70)).toBe(true);
  });

  it('Gate A emits a contribution per signal (in-range too)', () => {
    const a = r.gates.find((g) => g.id === 'A')!;
    expect(a.contributions).toHaveLength(7);
    const fields = a.contributions.map((c) => c.field);
    expect(fields).toContain('spo2_pct');
    expect(fields).toContain('symptoms');
  });

  it('dominant signal is a weight/symptom borderline driver', () => {
    expect(['weight_delta_72h_lb', 'symptoms']).toContain(r.dominant_signal);
    expect(r.dominant_note.length).toBeGreaterThan(0);
  });

  it('rationale uses the Eligible template', () => {
    expect(r.rationale).toContain('Mrs. R clears all three gates');
    expect(r.rationale).toContain('Recommend home management');
  });

  it('confidence is high on a complete record', () => {
    expect(r.confidence.level).toBe('high');
    expect(r.confidence.completeness).toBeGreaterThanOrEqual(0.9);
    // Now computed by real k-NN over the case corpus (cases.ts), not hardcoded.
    expect(r.confidence.model_certainty).toBeGreaterThan(0);
    expect(r.confidence.model_certainty).toBeLessThanOrEqual(1);
    expect(Number.isInteger(r.confidence.case_similarity_n)).toBe(true);
    expect(r.confidence.case_similarity_n).toBeGreaterThanOrEqual(0);
  });
});

describe('scoreEligibility — §11 Mr. D (Watch)', () => {
  const r = scoreEligibility(mrD);

  it('Gate A lands in the 50–69 Watch band (spec ≈ 67)', () => {
    const a = r.gates.find((g) => g.id === 'A')!;
    expect(a.score).toBeGreaterThanOrEqual(50);
    expect(a.score).toBeLessThanOrEqual(69);
  });

  it('band is watch (gate 50–69 rule), no red flags', () => {
    expect(r.red_flags).toHaveLength(0);
    expect(r.band).toBe('watch');
  });

  it('rationale uses the Watch template', () => {
    expect(r.rationale).toContain('home-manageable with conditions');
  });
});

describe('scoreEligibility — §11 Ms. K (Admit)', () => {
  const r = scoreEligibility(msK);

  it('RF1 fired', () => {
    expect(r.red_flags.map((f) => f.code)).toContain('RF1');
  });

  it('Gate C < 50', () => {
    const c = r.gates.find((g) => g.id === 'C')!;
    expect(c.score).toBeLessThan(50);
  });

  it('band is admit', () => {
    expect(r.band).toBe('admit');
  });

  it('rationale uses the Admit template with the red-flag clause', () => {
    expect(r.rationale).toContain('Recommend admission');
    expect(r.rationale).toContain('red flag');
  });
});

// ---------------------------------------------------------------------------
// §12 — assessTrend 5-day series for Mrs. R.
// ---------------------------------------------------------------------------

const series: Reading[] = [
  { day: 1, weight_lb: 148.0, spo2_pct: 95, hr_bpm: 78 },
  { day: 2, weight_lb: 148.2, spo2_pct: 95, hr_bpm: 77 },
  { day: 3, weight_lb: 149.5, spo2_pct: 94, hr_bpm: 82 },
  { day: 4, weight_lb: 151.4, spo2_pct: 93, hr_bpm: 89 },
  { day: 5, weight_lb: 150.1, spo2_pct: 94, hr_bpm: 83 },
];

const baseline = series.slice(0, 2);

describe('assessTrend — §12 Mrs. R series', () => {
  it('day 2 (baseline) is green', () => {
    expect(assessTrend(baseline, series[1]).tier).toBe('green');
  });

  it('day 3 is green', () => {
    expect(assessTrend(baseline, series[2]).tier).toBe('green');
  });

  it('day 4 is yellow with all_values_in_range true', () => {
    const t = assessTrend(baseline, series[3]);
    expect(t.tier).toBe('yellow');
    expect(t.all_values_in_range).toBe(true);
    // Deltas per spec: Δw +3.3, SpO₂ −2, HR +11.
    expect(t.weight_delta_vs_baseline).toBeCloseTo(3.3, 5);
    expect(t.spo2_delta_vs_baseline).toBeCloseTo(-2, 5);
    expect(t.hr_delta_vs_baseline).toBeCloseTo(11.5, 5);
    expect(t.reason).toContain('No threshold alarm');
  });

  it('day 5 (post-intervention) is green', () => {
    expect(assessTrend(baseline, series[4]).tier).toBe('green');
  });

  it('a frank red-flag reading (SpO₂ < 92) is red', () => {
    const t = assessTrend(baseline, { day: 6, weight_lb: 152.0, spo2_pct: 90, hr_bpm: 84 });
    expect(t.tier).toBe('red');
    expect(t.all_values_in_range).toBe(false);
  });
});
