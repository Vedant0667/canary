// Canary — Eligibility Scoring Engine.
// Pure, deterministic, zero runtime imports. Implements careloop-scoring-spec.md §3–§12.
// The UI never computes clinically; it only renders the ScoreResult / TierResult produced here.

import type {
  PatientRecord,
  Reading,
  ScoreResult,
  TierResult,
  Gate,
  Contribution,
  ThresholdRange,
  RedFlag,
  RedFlagCode,
  SignalStatus,
  GateStatus,
  Band,
  Confidence,
  ConfidenceLevel,
  Device,
  Tier,
  Dyspnea,
} from '../types';
import { caseSimilarity, type CaseMatch } from './cases';

// ---------------------------------------------------------------------------
// Static demo constants (spec §7 — internally simulated).
// ---------------------------------------------------------------------------

// Points for each signal status (spec §4).
const POINTS: Record<SignalStatus, number> = { in: 100, borderline: 60, out: 0 };

// ---------------------------------------------------------------------------
// §3 Red flags — checked FIRST.
// ---------------------------------------------------------------------------

function redFlags(record: PatientRecord): RedFlag[] {
  const flags: RedFlag[] = [];
  const v = record.vitals;
  const s = record.symptoms;

  const push = (code: RedFlagCode, label: string) => flags.push({ code, label });

  if (v.spo2_pct != null && v.spo2_pct < 92) {
    push('RF1', `SpO₂ ${v.spo2_pct} — below home-manageable floor`);
  }
  if (v.bp_systolic != null && v.bp_systolic < 90) {
    push('RF2', `Systolic BP ${v.bp_systolic} — hypotensive`);
  }
  if (s.dyspnea === 'at_rest') {
    push('RF3', 'Dyspnea at rest — respiratory distress');
  }
  if (s.chest_pain === true) {
    push('RF4', 'Chest pain reported');
  }
  if (v.hr_bpm != null && (v.hr_bpm < 45 || v.hr_bpm > 130)) {
    push('RF5', `Heart rate ${v.hr_bpm} bpm — outside safe range`);
  }
  if (v.weight_delta_72h_lb != null && v.weight_delta_72h_lb >= 5) {
    push('RF6', `Weight up ${v.weight_delta_72h_lb} lb / 72h — acute fluid overload`);
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Contribution helper.
// ---------------------------------------------------------------------------

function contrib(args: {
  field: string;
  label: string;
  value: Contribution['value'];
  unit?: string;
  status: SignalStatus;
  weight: number;
  range: ThresholdRange;
  note: string;
}): Contribution {
  return {
    field: args.field,
    label: args.label,
    value: args.value,
    unit: args.unit,
    status: args.status,
    points: POINTS[args.status],
    weight: args.weight,
    range: args.range,
    note: args.note,
  };
}

// ---------------------------------------------------------------------------
// §4 Gate A — Clinical stability (weight 0.50).
// ---------------------------------------------------------------------------

function gateA(record: PatientRecord): Gate {
  const v = record.vitals;
  const s = record.symptoms;
  const c: Contribution[] = [];

  // spo2_pct — weight 0.20
  {
    const x = v.spo2_pct;
    const range: ThresholdRange = { in: '≥ 94', borderline: '92–93', out: '< 92' };
    let status: SignalStatus;
    let note: string;
    if (x == null) {
      status = 'out';
      note = 'SpO₂ not recorded — treated as out of range';
    } else if (x >= 94) {
      status = 'in';
      note = `SpO₂ ${x}% — well oxygenated, comfortably clear of the 94% floor`;
    } else if (x >= 92) {
      status = 'borderline';
      note = `SpO₂ ${x}% — mildly low, watch closely`;
    } else {
      status = 'out';
      note = `SpO₂ ${x}% — below home-manageable floor`;
    }
    c.push(contrib({ field: 'spo2_pct', label: 'SpO₂', value: x, unit: '%', status, weight: 0.2, range, note }));
  }

  // weight_delta_72h_lb — weight 0.20
  {
    const x = v.weight_delta_72h_lb;
    const range: ThresholdRange = { in: '< 2', borderline: '2–4', out: '> 4' };
    let status: SignalStatus;
    let note: string;
    if (x == null) {
      status = 'out';
      note = 'Weight trend not recorded — treated as out of range';
    } else if (x < 2) {
      status = 'in';
      note = `Weight up ${x} lb over 72h — stable fluid balance`;
    } else if (x <= 4) {
      status = 'borderline';
      note = `Weight up ${x} lb over 72h — early fluid signal, still within the home-manageable band`;
    } else {
      status = 'out';
      note = `Weight up ${x} lb over 72h — rapid fluid gain`;
    }
    c.push(contrib({ field: 'weight_delta_72h_lb', label: 'Weight Δ 72h', value: x, unit: 'lb', status, weight: 0.2, range, note }));
  }

  // hr_bpm — weight 0.15
  {
    const x = v.hr_bpm;
    const range: ThresholdRange = { in: '50–100', borderline: '45–49 / 101–110', out: '< 45 / > 110' };
    let status: SignalStatus;
    let note: string;
    if (x == null) {
      status = 'out';
      note = 'Heart rate not recorded — treated as out of range';
    } else if (x >= 50 && x <= 100) {
      status = 'in';
      note = `Heart rate ${x} bpm — within normal range`;
    } else if ((x >= 45 && x <= 49) || (x >= 101 && x <= 110)) {
      status = 'borderline';
      note = `Heart rate ${x} bpm — mildly outside normal range`;
    } else {
      status = 'out';
      note = `Heart rate ${x} bpm — outside safe range`;
    }
    c.push(contrib({ field: 'hr_bpm', label: 'Heart rate', value: x, unit: 'bpm', status, weight: 0.15, range, note }));
  }

  // bp_systolic — weight 0.15
  {
    const x = v.bp_systolic;
    const range: ThresholdRange = { in: '90–160', borderline: '161–180', out: '< 90 / > 180' };
    let status: SignalStatus;
    let note: string;
    if (x == null) {
      status = 'out';
      note = 'Systolic BP not recorded — treated as out of range';
    } else if (x >= 90 && x <= 160) {
      status = 'in';
      note = `Systolic BP ${x} — controlled`;
    } else if (x >= 161 && x <= 180) {
      status = 'borderline';
      note = `Systolic BP ${x} — mildly elevated`;
    } else {
      status = 'out';
      note = `Systolic BP ${x} — outside safe range`;
    }
    c.push(contrib({ field: 'bp_systolic', label: 'Systolic BP', value: x, unit: 'mmHg', status, weight: 0.15, range, note }));
  }

  // symptoms (worst of dyspnea / edema) — weight 0.15
  {
    const dyspnea = s.dyspnea;
    const edema = s.edema;
    const range: ThresholdRange = { in: 'none', borderline: 'exertional / edema↑', out: 'at rest' };
    let status: SignalStatus;
    let note: string;
    if (dyspnea == null && edema == null) {
      status = 'out';
      note = 'Symptoms not recorded — treated as out of range';
    } else if (dyspnea === 'at_rest') {
      status = 'out';
      note = 'Dyspnea at rest — respiratory distress';
    } else if (dyspnea === 'exertional' || edema === 'worsening') {
      status = 'borderline';
      const which =
        dyspnea === 'exertional' && edema === 'worsening'
          ? 'Exertional dyspnea and worsening edema'
          : dyspnea === 'exertional'
            ? 'Exertional dyspnea'
            : 'Worsening edema';
      note = `${which} — mild congestion, watch closely`;
    } else {
      status = 'in';
      note = 'No dyspnea, edema stable or absent — symptomatically stable';
    }
    // value: a compact worst-of label.
    const value =
      status === 'out'
        ? 'at rest'
        : status === 'borderline'
          ? dyspnea === 'exertional'
            ? 'exertional'
            : 'edema↑'
          : 'stable';
    c.push(contrib({ field: 'symptoms', label: 'Symptoms', value, status, weight: 0.15, range, note }));
  }

  // resp_rate — weight 0.10
  {
    const x = v.resp_rate;
    const range: ThresholdRange = { in: '≤ 20', borderline: '21–24', out: '> 24' };
    let status: SignalStatus;
    let note: string;
    if (x == null) {
      status = 'out';
      note = 'Respiratory rate not recorded — treated as out of range';
    } else if (x <= 20) {
      status = 'in';
      note = `Respiratory rate ${x} — normal`;
    } else if (x <= 24) {
      status = 'borderline';
      note = `Respiratory rate ${x} — mildly elevated`;
    } else {
      status = 'out';
      note = `Respiratory rate ${x} — tachypneic`;
    }
    c.push(contrib({ field: 'resp_rate', label: 'Resp. rate', value: x, unit: '/min', status, weight: 0.1, range, note }));
  }

  // temp_c — weight 0.05
  {
    const x = v.temp_c;
    const range: ThresholdRange = { in: '< 38.0', borderline: '38.0–38.5', out: '> 38.5' };
    let status: SignalStatus;
    let note: string;
    if (x == null) {
      status = 'out';
      note = 'Temperature not recorded — treated as out of range';
    } else if (x < 38.0) {
      status = 'in';
      note = `Temp ${x}°C — afebrile`;
    } else if (x <= 38.5) {
      status = 'borderline';
      note = `Temp ${x}°C — low-grade fever`;
    } else {
      status = 'out';
      note = `Temp ${x}°C — febrile`;
    }
    c.push(contrib({ field: 'temp_c', label: 'Temperature', value: x, unit: '°C', status, weight: 0.05, range, note }));
  }

  const score = weightedAverage(c);
  return { id: 'A', label: 'Clinical stability', weight: 0.5, score, status: gateStatus(score), contributions: c };
}

// ---------------------------------------------------------------------------
// §5 Gate B — Monitoring feasibility (weight 0.20).
// ---------------------------------------------------------------------------

const REQUIRED_DEVICES: Device[] = ['scale', 'pulse_ox', 'bp_cuff'];
const OPTIONAL_DEVICES: Device[] = ['ecg_patch'];

const DEVICE_LABEL: Record<Device, string> = {
  scale: 'Smart scale',
  pulse_ox: 'Pulse oximeter',
  bp_cuff: 'BP cuff',
  ecg_patch: 'ECG patch',
};

function gateB(record: PatientRecord): Gate {
  const have = new Set(record.devices_available);
  const deliverable = new Set(record.devices_deliverable_today ?? []);
  const c: Contribution[] = [];
  let score = 100;

  const requiredRange: ThresholdRange = { in: 'present', borderline: 'deliverable −15', out: 'missing −40' };
  const optionalRange: ThresholdRange = { in: 'present', borderline: 'missing −10', out: '—' };

  for (const d of REQUIRED_DEVICES) {
    if (have.has(d)) {
      c.push(contrib({ field: d, label: DEVICE_LABEL[d], value: 'present', status: 'in', weight: 0, range: requiredRange, note: `${DEVICE_LABEL[d]} available — required device present` }));
    } else if (deliverable.has(d)) {
      score -= 15;
      c.push(contrib({ field: d, label: DEVICE_LABEL[d], value: 'deliverable', status: 'borderline', weight: 0, range: requiredRange, note: `${DEVICE_LABEL[d]} not on hand but deliverable today (−15)` }));
    } else {
      score -= 40;
      c.push(contrib({ field: d, label: DEVICE_LABEL[d], value: 'missing', status: 'out', weight: 0, range: requiredRange, note: `${DEVICE_LABEL[d]} missing — required device absent (−40)` }));
    }
  }

  for (const d of OPTIONAL_DEVICES) {
    if (have.has(d)) {
      c.push(contrib({ field: d, label: DEVICE_LABEL[d], value: 'present', status: 'in', weight: 0, range: optionalRange, note: `${DEVICE_LABEL[d]} available — optional device present` }));
    } else {
      score -= 10;
      c.push(contrib({ field: d, label: DEVICE_LABEL[d], value: 'missing', status: 'borderline', weight: 0, range: optionalRange, note: `${DEVICE_LABEL[d]} missing — optional, reduces monitoring fidelity (−10)` }));
    }
  }

  score = Math.max(0, score);
  return { id: 'B', label: 'Monitoring feasibility', weight: 0.2, score, status: gateStatus(score), contributions: c };
}

// ---------------------------------------------------------------------------
// §6 Gate C — Home & social readiness (weight 0.30).
// ---------------------------------------------------------------------------

function gateC(record: PatientRecord): Gate {
  const h = record.home;
  const c: Contribution[] = [];
  let score = 100;

  // caregiver
  {
    const x = h.caregiver;
    const range: ThresholdRange = { in: 'full-time', borderline: 'part-time −15', out: 'none −40' };
    let deduct = 0;
    let status: SignalStatus = 'in';
    let note: string;
    if (x === 'full_time') {
      note = 'Full-time caregiver in home';
    } else if (x === 'part_time') {
      deduct = 15;
      status = 'borderline';
      note = 'Part-time caregiver — gaps in supervision (−15)';
    } else {
      // none or null
      deduct = 40;
      status = 'out';
      note = x === null ? 'Caregiver status unknown — treated as none (−40)' : 'No caregiver in home (−40)';
    }
    score -= deduct;
    c.push(contrib({ field: 'caregiver', label: 'Caregiver', value: x ?? 'none', status, weight: 0, range, note }));
  }

  // housing_stable
  {
    const x = h.housing_stable;
    const range: ThresholdRange = { in: 'stable', borderline: '—', out: 'unstable −30' };
    const unstable = x === false || x == null;
    const deduct = unstable ? 30 : 0;
    score -= deduct;
    c.push(
      contrib({
        field: 'housing_stable',
        label: 'Housing',
        value: x === false ? 'unstable' : x == null ? 'unknown' : 'stable',
        status: unstable ? 'out' : 'in',
        weight: 0,
        range,
        note: unstable
          ? (x === null ? 'Housing stability unknown — treated as unstable (−30)' : 'Housing not stable (−30)')
          : 'Housing stable',
      }),
    );
  }

  // has_power_refrigeration
  {
    const x = h.has_power_refrigeration;
    const range: ThresholdRange = { in: 'available', borderline: '—', out: 'absent −25' };
    const missing = x === false || x == null;
    const deduct = missing ? 25 : 0;
    score -= deduct;
    c.push(
      contrib({
        field: 'has_power_refrigeration',
        label: 'Power / fridge',
        value: x === false ? 'absent' : x == null ? 'unknown' : 'available',
        status: missing ? 'out' : 'in',
        weight: 0,
        range,
        note: missing
          ? (x === null ? 'Power/refrigeration unknown — treated as absent (−25)' : 'No reliable power/refrigeration (−25)')
          : 'Power and refrigeration available',
      }),
    );
  }

  // connectivity
  {
    const x = h.connectivity;
    const range: ThresholdRange = { in: 'wi-fi', borderline: 'cell-only −8', out: 'none −35' };
    let deduct = 0;
    let status: SignalStatus = 'in';
    let note: string;
    if (x === 'wifi') {
      note = 'Wi-Fi connectivity — reliable data uplink';
    } else if (x === 'cell_only') {
      deduct = 8;
      status = 'borderline';
      note = 'Cell-only connectivity — adequate but limited (−8)';
    } else {
      deduct = 35;
      status = 'out';
      note = x === null ? 'Connectivity unknown — treated as none (−35)' : 'No connectivity — cannot transmit readings (−35)';
    }
    score -= deduct;
    c.push(contrib({ field: 'connectivity', label: 'Connectivity', value: x ?? 'none', status, weight: 0, range, note }));
  }

  // med_self_admin
  {
    const x = h.med_self_admin;
    const range: ThresholdRange = { in: 'self', borderline: 'assisted −10', out: 'no −25' };
    let deduct = 0;
    let status: SignalStatus = 'in';
    let note: string;
    if (x === 'yes') {
      note = 'Manages own medications';
    } else if (x === 'assisted') {
      deduct = 10;
      status = 'borderline';
      note = 'Medications require assistance (−10)';
    } else {
      deduct = 25;
      status = 'out';
      note = x === null ? 'Medication self-admin unknown — treated as no (−25)' : 'Cannot self-administer medications (−25)';
    }
    score -= deduct;
    c.push(contrib({ field: 'med_self_admin', label: 'Med self-admin', value: x ?? 'no', status, weight: 0, range, note }));
  }

  // fall_risk
  {
    const x = h.fall_risk;
    const range: ThresholdRange = { in: 'low', borderline: 'moderate −6', out: 'high −25' };
    let deduct = 0;
    let status: SignalStatus = 'in';
    let note: string;
    if (x === 'low') {
      note = 'Low fall risk';
    } else if (x === 'moderate') {
      deduct = 6;
      status = 'borderline';
      note = 'Moderate fall risk (−6)';
    } else {
      deduct = 25;
      status = 'out';
      note = x === null ? 'Fall risk unknown — treated as high (−25)' : 'High fall risk (−25)';
    }
    score -= deduct;
    c.push(contrib({ field: 'fall_risk', label: 'Fall risk', value: x ?? 'high', status, weight: 0, range, note }));
  }

  score = Math.max(0, score);
  return { id: 'C', label: 'Home & social readiness', weight: 0.3, score, status: gateStatus(score), contributions: c };
}

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------

function weightedAverage(contributions: Contribution[]): number {
  let totalWeight = 0;
  let acc = 0;
  for (const c of contributions) {
    totalWeight += c.weight;
    acc += c.points * c.weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round(acc / totalWeight);
}

function gateStatus(score: number): GateStatus {
  if (score >= 70) return 'pass';
  if (score >= 50) return 'watch';
  return 'fail';
}

// ---------------------------------------------------------------------------
// §7 Confidence — completeness over the ~20 schema fields.
// ---------------------------------------------------------------------------

function assessConfidence(record: PatientRecord, sim: CaseMatch): Confidence {
  const v = record.vitals;
  const s = record.symptoms;
  const h = record.home;

  // The ~20 schema fields (spec §2). devices_available counts as one field;
  // present when at least one device is listed.
  const fields: Array<unknown> = [
    record.name,
    record.age,
    record.mrn,
    record.condition,
    v.hr_bpm,
    v.bp_systolic,
    v.bp_diastolic,
    v.spo2_pct,
    v.resp_rate,
    v.temp_c,
    v.weight_lb,
    v.weight_delta_72h_lb,
    s.dyspnea,
    s.edema,
    s.chest_pain,
    record.devices_available.length > 0 ? record.devices_available : null,
    h.caregiver,
    h.housing_stable,
    h.has_power_refrigeration,
    h.connectivity,
    h.med_self_admin,
    h.fall_risk,
  ];

  const total = fields.length;
  const present = fields.filter((f) => f !== null && f !== undefined).length;
  const completeness = present / total;

  // `sim` is the real vectorized k-NN retrieval over the prior-case corpus
  // (computed once in scoreEligibility), replacing the old "(simulated)" constants.
  let level: ConfidenceLevel;
  if (completeness >= 0.9) level = 'high';
  else if (completeness >= 0.7) level = 'medium';
  else level = 'low';

  // The retrieval feeds confidence (a little): a patient unlike anything in the
  // case base shouldn't be a high-confidence "send home". A true outlier (no near
  // neighbours) caps confidence at low — which caps the band at Watch in
  // determineBand — and mild novelty trims a high to medium. Typical, well-matched
  // patients (e.g. Mrs. R, certainty ≈ 0.48) are unaffected.
  if (sim.n === 0 || sim.certainty < 0.3) level = 'low';
  else if (level === 'high' && sim.certainty < 0.4) level = 'medium';

  return { level, completeness, model_certainty: sim.certainty, case_similarity_n: sim.n };
}

// ---------------------------------------------------------------------------
// §6 Band determination (with weakest-link caps + §7 low-confidence cap).
// ---------------------------------------------------------------------------

function determineBand(
  overall: number,
  gates: Gate[],
  flags: RedFlag[],
  confidence: Confidence,
): Band {
  if (flags.length > 0) return 'admit';

  const scores = gates.map((g) => g.score);
  const minGate = Math.min(...scores);

  let band: Band;
  if (overall < 60 || minGate < 50) {
    band = 'admit';
  } else if (overall >= 80 && scores.every((s) => s >= 70)) {
    band = 'eligible';
  } else {
    // overall 60–79, OR any gate 50–69.
    band = 'watch';
  }

  // §7: low confidence caps the band at Watch (never Eligible on thin data).
  if (confidence.level === 'low' && band === 'eligible') {
    band = 'watch';
  }
  return band;
}

// ---------------------------------------------------------------------------
// §9 Rationale templates (assembled, never generated).
// ---------------------------------------------------------------------------

const GATE_LABEL: Record<'A' | 'B' | 'C', string> = {
  A: 'Clinical stability',
  B: 'Monitoring feasibility',
  C: 'Home & social readiness',
};

function buildRationale(
  record: PatientRecord,
  band: Band,
  gates: Gate[],
  flags: RedFlag[],
  dominantNote: string,
): string {
  const name = record.name ?? 'This patient';

  if (band === 'eligible') {
    const cadence = ' with standard nurse-visit cadence';
    return `${name} clears all three gates. ${dominantNote}. Recommend home management${cadence}.`;
  }

  if (band === 'watch') {
    // weakest gate = lowest-scoring gate.
    const weak = gates.reduce((a, b) => (b.score < a.score ? b : a));
    const mitigation = 'tighter monitoring and a same-week nurse visit';
    return `${name} is home-manageable with conditions: ${weak.label} scored ${weak.score}. ${dominantNote}. Recommend home + ${mitigation}.`;
  }

  // admit
  const failedGate = gates
    .filter((g) => g.score < 50)
    .sort((a, b) => a.score - b.score)[0];
  const failedGateLabel = failedGate ? failedGate.label : GATE_LABEL.A;

  let redFlagClause = '';
  if (flags.length > 0) {
    redFlagClause = ` — red flag: ${flags.map((f) => f.label).join('; ')}`;
  }
  return `${name} does not clear ${failedGateLabel}${redFlagClause}. Recommend admission.`;
}

// ---------------------------------------------------------------------------
// dominant signal = field of the largest weighted deduction across all gates.
// ---------------------------------------------------------------------------

function findDominant(gates: Gate[]): { field: string; note: string } {
  let best: { field: string; note: string; loss: number } | null = null;
  for (const g of gates) {
    for (const c of g.contributions) {
      // weighted deduction relative to a perfect 100 contribution.
      const loss = g.weight * c.weight * (100 - c.points);
      if (best === null || loss > best.loss) {
        best = { field: c.field, note: c.note, loss };
      }
    }
  }
  if (best === null) return { field: '', note: '' };
  return { field: best.field, note: best.note };
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

export function scoreEligibility(record: PatientRecord): ScoreResult {
  const flags = redFlags(record);

  const gates: Gate[] = [gateA(record), gateB(record), gateC(record)];
  const [a, b, c] = gates;

  const overall = Math.round(0.5 * a.score + 0.2 * b.score + 0.3 * c.score);

  // Real vectorized retrieval over the prior-case corpus (computed once, shared).
  const sim = caseSimilarity(record);
  const confidence = assessConfidence(record, sim);
  const rulesBand = determineBand(overall, gates, flags, confidence);

  // Outcome corroboration gate: an "Eligible" call must be backed by good outcomes
  // among similar prior patients. If patients like this one did poorly at home, step
  // Eligible down to Watch. Conservative — it never upgrades, and admit/red-flag
  // logic is untouched, so the recommendation can only become more cautious.
  const CORROBORATION_BAR = 0.85;
  const corroborates = sim.homeSuccessRate >= CORROBORATION_BAR;
  const band: Band = rulesBand === 'eligible' && !corroborates ? 'watch' : rulesBand;

  const similar_outcomes = {
    home_success_rate: sim.homeSuccessRate,
    n: sim.n,
    corroborates,
  };

  const dominant = findDominant(gates);
  let rationale = buildRationale(record, band, gates, flags, dominant.note);
  const pctHome = `${Math.round(sim.homeSuccessRate * 100)}% of ${sim.n} similar prior patients`;
  if (rulesBand === 'eligible' && !corroborates) {
    rationale += ` Stepped down from Eligible: only ${pctHome} were safely managed at home.`;
  } else if (band === 'eligible') {
    rationale += ` Corroborated by outcomes: ${pctHome} were safely managed at home.`;
  }

  return {
    overall,
    band,
    red_flags: flags,
    confidence,
    similar_outcomes,
    gates,
    dominant_signal: dominant.field,
    dominant_note: dominant.note,
    rationale,
  };
}

// ---------------------------------------------------------------------------
// §12 assessTrend — monitoring trend (dashboard vignette).
// ---------------------------------------------------------------------------

export function assessTrend(
  baselineDays: Reading[],
  today: Reading,
  // Daily provider-reported symptom status for `today` (home-care check-in).
  // Symptoms are part of the clinical picture, not just vitals: a patient who is
  // dyspneic at rest is escalated even when every tracked number looks fine.
  symptom: Dyspnea | null = null,
): TierResult {
  // Baseline = mean of days 1–2 per signal.
  const base = baselineDays.slice(0, 2);
  const n = base.length || 1;
  const baseWeight = base.reduce((s, r) => s + r.weight_lb, 0) / n;
  const baseSpo2 = base.reduce((s, r) => s + r.spo2_pct, 0) / n;
  const baseHr = base.reduce((s, r) => s + r.hr_bpm, 0) / n;

  const dWeight = today.weight_lb - baseWeight;
  const dSpo2 = today.spo2_pct - baseSpo2;
  const dHr = today.hr_bpm - baseHr;

  // Absolute-range checks mirror §3 red-flag thresholds for the three tracked vitals.
  const spo2OutOfRange = today.spo2_pct < 92;
  const hrOutOfRange = today.hr_bpm < 45 || today.hr_bpm > 130;
  const weightOutOfRange = dWeight >= 5;
  const anyValueOutOfRange = spo2OutOfRange || hrOutOfRange || weightOutOfRange;

  let tier: TierResult['tier'];
  let reason: string;

  if (anyValueOutOfRange) {
    tier = 'red';
    const parts: string[] = [];
    if (spo2OutOfRange) parts.push(`SpO₂ ${today.spo2_pct}% below 92`);
    if (hrOutOfRange) parts.push(`HR ${today.hr_bpm} bpm outside safe range`);
    if (weightOutOfRange) parts.push(`weight up ${round1(dWeight)} lb vs baseline`);
    reason = `Red: ${parts.join(', ')}. Escalate.`;
  } else if (dWeight >= 3 && (dSpo2 <= -2 || dHr >= 10)) {
    // §12 yellow trend composite — fires even when every absolute value is in range.
    tier = 'yellow';
    const driver = dSpo2 <= -2 ? `SpO₂ down ${round1(-dSpo2)}` : `HR up ${round1(dHr)}`;
    reason = `Yellow: weight up ${round1(dWeight)} lb vs baseline with ${driver} — converging trend. No threshold alarm would have fired yet.`;
  } else {
    tier = 'green';
    reason = 'Green: vitals tracking at or near baseline.';
  }

  // Daily provider-reported symptom escalation. Dyspnea at rest is respiratory
  // distress → red; exertional dyspnea → at least yellow. Never de-escalates a
  // vitals-driven tier (we take the worse of the two).
  const rank: Record<Tier, number> = { green: 0, yellow: 1, red: 2 };
  const vitalsReason = reason;
  if (symptom === 'at_rest' && rank[tier] < rank.red) {
    tier = 'red';
    reason = `Red: provider reports dyspnea at rest — respiratory distress, escalate. (Vitals: ${vitalsReason})`;
  } else if (symptom === 'exertional' && rank[tier] < rank.yellow) {
    tier = 'yellow';
    reason = `Yellow: provider reports exertional dyspnea — symptom-driven, watch closely. (Vitals: ${vitalsReason})`;
  } else if (symptom === 'at_rest' || symptom === 'exertional') {
    reason = `${reason} Provider also reports ${symptom === 'at_rest' ? 'dyspnea at rest' : 'exertional dyspnea'}.`;
  }

  // True when tier is not green but no individual value is itself out-of-range.
  const all_values_in_range = tier !== 'green' && !anyValueOutOfRange;

  return {
    tier,
    weight_delta_vs_baseline: round1(dWeight),
    spo2_delta_vs_baseline: round1(dSpo2),
    hr_delta_vs_baseline: round1(dHr),
    all_values_in_range,
    weight_in_range: !weightOutOfRange,
    spo2_in_range: !spo2OutOfRange,
    hr_in_range: !hrOutOfRange,
    reason,
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
