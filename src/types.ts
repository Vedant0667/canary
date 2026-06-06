// Cardinal shared type contract.
// Derived verbatim from careloop-scoring-spec.md §2 (PatientRecord), §8 (ScoreResult),
// and §12/§13 (trend). The engine produces these; the UI ONLY renders them.
// All UI numbers must trace to a `contributions` record — never hardcode clinical copy.

// ---------------------------------------------------------------------------
// Input — PatientRecord (spec §2). Also the JSON schema given to Claude.
// All fields nullable: missing data is handled by the confidence model (§7),
// never by guessing.
// ---------------------------------------------------------------------------

export type Dyspnea = 'none' | 'exertional' | 'at_rest';
export type Edema = 'none' | 'stable' | 'worsening';
export type Device = 'scale' | 'bp_cuff' | 'pulse_ox' | 'ecg_patch';
export type Caregiver = 'none' | 'part_time' | 'full_time';
export type Connectivity = 'none' | 'cell_only' | 'wifi';
export type MedSelfAdmin = 'yes' | 'assisted' | 'no';
export type FallRisk = 'low' | 'moderate' | 'high';

export interface Vitals {
  hr_bpm: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  spo2_pct: number | null;
  resp_rate: number | null;
  temp_c: number | null;
  weight_lb: number | null;
  weight_delta_72h_lb: number | null;
}

export interface Symptoms {
  dyspnea: Dyspnea | null;
  edema: Edema | null;
  chest_pain: boolean | null;
}

export interface HomeFactors {
  caregiver: Caregiver | null;
  housing_stable: boolean | null;
  has_power_refrigeration: boolean | null;
  connectivity: Connectivity | null;
  med_self_admin: MedSelfAdmin | null;
  fall_risk: FallRisk | null;
}

export interface PatientRecord {
  name: string | null;
  age: number | null;
  mrn: string | null;
  condition: 'CHF';
  vitals: Vitals;
  symptoms: Symptoms;
  devices_available: Device[];
  // Optional demo nuance (spec §5): devices a vendor can drop off same-day.
  devices_deliverable_today?: Device[];
  home: HomeFactors;
}

// ---------------------------------------------------------------------------
// Output — ScoreResult (spec §8). Drives the entire Triage UI.
// ---------------------------------------------------------------------------

export type SignalStatus = 'in' | 'borderline' | 'out';
export type GateStatus = 'pass' | 'watch' | 'fail';
export type Band = 'eligible' | 'watch' | 'admit';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type RedFlagCode = 'RF1' | 'RF2' | 'RF3' | 'RF4' | 'RF5' | 'RF6';

export interface RedFlag {
  code: RedFlagCode;
  label: string; // e.g. "SpO₂ 91 — below home-manageable floor"
}

// The in / borderline / out thresholds for a signal, as short human-readable
// boundary labels. Rendered as a 3-segment "threshold ladder" so a clinician can
// see exactly where the patient's value sits — and prove no single one was breached.
export interface ThresholdRange {
  in: string; // e.g. "≥ 94"
  borderline: string; // e.g. "92–93"
  out: string; // e.g. "< 92"
}

// One record per signal / checklist item — ALWAYS emitted, in-range ones too.
export interface Contribution {
  field: string;
  label: string; // human-readable signal name, e.g. "SpO₂", "Caregiver"
  value: string | number | boolean | null;
  unit?: string; // e.g. "%", "bpm", "lb/72h"
  status: SignalStatus;
  points: number; // 0..100 signal points
  weight: number; // share of the gate
  range: ThresholdRange; // the in/borderline/out thresholds for this signal
  note: string; // plain-English explanation rendered in the gate expander
}

export interface Gate {
  id: 'A' | 'B' | 'C';
  label: string;
  weight: number; // A 0.50 · B 0.20 · C 0.30
  score: number; // 0..100
  status: GateStatus;
  contributions: Contribution[];
}

export interface Confidence {
  level: ConfidenceLevel;
  completeness: number; // 0..1
  // Real vectorized k-NN retrieval over the prior-case corpus (src/engine/cases.ts).
  model_certainty: number; // 0..1 — mean similarity of the nearest neighbours
  case_similarity_n: number; // count of genuinely-similar prior cases
}

// Outcome evidence from the case base: of patients similar to this one, how many
// were safely managed at home? Gates the "Eligible" call (see determineBand).
export interface SimilarOutcomes {
  home_success_rate: number; // 0..1, similarity-weighted among nearest prior cases
  n: number; // count of genuinely-similar prior cases
  corroborates: boolean; // rate meets the bar to corroborate a "home" recommendation
}

export interface ScoreResult {
  overall: number;
  band: Band;
  red_flags: RedFlag[];
  confidence: Confidence;
  similar_outcomes: SimilarOutcomes;
  gates: Gate[];
  dominant_signal: string; // field name of the largest weighted deduction
  dominant_note: string; // the note for that signal (for templated rationale)
  rationale: string; // assembled from templates (spec §9), never LLM-generated
}

// ---------------------------------------------------------------------------
// Monitoring trend — assessTrend (spec §12).
// ---------------------------------------------------------------------------

export type Tier = 'green' | 'yellow' | 'red';

export interface Reading {
  day: number;
  weight_lb: number;
  spo2_pct: number;
  hr_bpm: number;
}

export interface TierResult {
  tier: Tier;
  // Deltas vs the days 1–2 baseline mean, for the alert caption.
  weight_delta_vs_baseline: number;
  spo2_delta_vs_baseline: number;
  hr_delta_vs_baseline: number;
  // True when tier is yellow/red but every absolute value is still in-range —
  // the "no threshold alarm would have fired yet" demo moment.
  all_values_in_range: boolean;
  // Per-vital absolute-threshold verdicts (each independently derived by the
  // engine, so the dashboard's three alarm cards render real per-signal truth
  // rather than one shared flag).
  weight_in_range: boolean;
  spo2_in_range: boolean;
  hr_in_range: boolean;
  reason: string;
}
