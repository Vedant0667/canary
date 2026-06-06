// Canary — home-monitoring backend datastore (SQLite via better-sqlite3).
//
// Holds the configurable monitoring layer the clinician customizes per patient:
//  - metrics:        the catalog of datasets a clinician can choose to monitor
//  - monitor_config: which datasets (ordered) are being monitored for a patient
//  - metric_series:  the per-patient, per-metric 5-day values (synthetic demo data)
//
// All data is synthetic (no real patient data). The point is a real, queryable
// database behind the configurable dashboard, not just an in-browser array.

import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'canary.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    unit TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    decimals INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS patients (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mrn TEXT,
    condition TEXT NOT NULL DEFAULT 'chf'
  );
  CREATE TABLE IF NOT EXISTS monitor_config (
    patient_key TEXT NOT NULL,
    metric_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (patient_key, metric_id)
  );
  CREATE TABLE IF NOT EXISTS metric_series (
    patient_key TEXT NOT NULL,
    metric_id TEXT NOT NULL,
    t INTEGER NOT NULL,
    value REAL NOT NULL,
    PRIMARY KEY (patient_key, metric_id, t)
  );
  CREATE TABLE IF NOT EXISTS packets (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    blurb TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    cached_record TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );
  -- The patient record (the INPUT) that was last scored for this patient.
  CREATE TABLE IF NOT EXISTS patient_records (
    patient_key TEXT PRIMARY KEY,
    record_json TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  -- Home-readiness score, COMPUTED on the backend by the clinical engine and stored.
  CREATE TABLE IF NOT EXISTS readiness_scores (
    patient_key TEXT PRIMARY KEY,
    overall INTEGER NOT NULL,
    band TEXT NOT NULL,
    result_json TEXT NOT NULL,
    computed_at TEXT NOT NULL
  );
  -- Per-day monitoring trend tier, COMPUTED on the backend (assessTrend) and stored.
  CREATE TABLE IF NOT EXISTS trend_assessments (
    patient_key TEXT NOT NULL,
    day INTEGER NOT NULL,
    tier TEXT NOT NULL,
    result_json TEXT NOT NULL,
    computed_at TEXT NOT NULL,
    PRIMARY KEY (patient_key, day)
  );
  -- Per-chronic-condition monitoring TEMPLATE: the catalog metadata...
  CREATE TABLE IF NOT EXISTS condition_templates (
    condition TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NOT NULL
  );
  -- ...and the ordered set of datasets (charts) a condition auto-monitors.
  CREATE TABLE IF NOT EXISTS template_metrics (
    condition TEXT NOT NULL,
    metric_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (condition, metric_id)
  );
`);

// Older DBs predate the patients.condition column — add it if missing (no-op otherwise).
try {
  const cols = db.prepare('PRAGMA table_info(patients)').all();
  if (!cols.some((c) => c.name === 'condition')) {
    db.exec("ALTER TABLE patients ADD COLUMN condition TEXT NOT NULL DEFAULT 'chf'");
  }
} catch {
  /* table just created with the column — nothing to migrate */
}

// The three discharge packets (the clinical INPUTS to triage). The raw hospital
// paperwork and the canonical extraction are read from source files and persisted
// here, so the app fetches its case data from the database rather than the bundle.
const PACKET_SEED = [
  { id: 'mrs-r', label: 'Mrs. R', blurb: '72F CHF, stable, daughter caregiver' },
  { id: 'mr-d', label: 'Mr. D', blurb: '68M CHF, SpO2 93, weight +3.1 lb, part-time caregiver' },
  { id: 'ms-k', label: 'Ms. K', blurb: '81F CHF, SpO2 91, lives alone' },
];
const dataDir = join(__dirname, '..', 'src', 'data');
const insPacket = db.prepare(
  'INSERT OR REPLACE INTO packets (id,label,blurb,raw_text,cached_record,position) VALUES (?,?,?,?,?,?)',
);
PACKET_SEED.forEach((p, i) => {
  const rawText = readFileSync(join(dataDir, 'packets', `${p.id}.md`), 'utf8');
  const cachedRecord = readFileSync(join(dataDir, 'extractions', `${p.id}.json`), 'utf8');
  insPacket.run(p.id, p.label, p.blurb, rawText, cachedRecord, i);
});

// The catalog of monitorable datasets. `base`/`amp` drive synthetic series and are
// not stored in the catalog table (only the display columns are).
export const METRICS = [
  { id: 'weight_lb', label: 'Daily weight', unit: 'lb', description: 'Sudden gain signals fluid retention', category: 'Vitals', decimals: 1, base: 150, amp: 2.2 },
  { id: 'spo2_pct', label: 'Blood oxygen (SpO₂)', unit: '%', description: 'Oxygen saturation', category: 'Vitals', decimals: 0, base: 95, amp: 2 },
  { id: 'hr_bpm', label: 'Heart rate', unit: 'bpm', description: 'Resting heart rate', category: 'Vitals', decimals: 0, base: 80, amp: 6 },
  { id: 'bp_systolic', label: 'Blood pressure', unit: 'mmHg', description: 'Systolic pressure', category: 'Vitals', decimals: 0, base: 128, amp: 8 },
  { id: 'resp_rate', label: 'Respiratory rate', unit: '/min', description: 'Breaths per minute', category: 'Vitals', decimals: 0, base: 18, amp: 2 },
  { id: 'edema_score', label: 'Edema score', unit: '/4', description: 'Lower-extremity swelling, 0–4', category: 'Symptoms', decimals: 0, base: 1, amp: 1 },
  { id: 'sodium_mg', label: 'Sodium intake', unit: 'mg', description: 'Daily dietary sodium', category: 'Intake', decimals: 0, base: 2000, amp: 450 },
  { id: 'fluid_ml', label: 'Fluid intake', unit: 'mL', description: 'Daily fluid intake', category: 'Intake', decimals: 0, base: 1500, amp: 300 },
  { id: 'med_adherence', label: 'Med adherence', unit: '%', description: 'Doses taken on time', category: 'Adherence', decimals: 0, base: 92, amp: 6 },
  // COPD-oriented datasets.
  { id: 'peak_flow', label: 'Peak expiratory flow', unit: 'L/min', description: 'Best of three blows; falling = airway narrowing', category: 'Respiratory', decimals: 0, base: 320, amp: 38 },
  // Diabetes-oriented datasets.
  { id: 'blood_glucose', label: 'Blood glucose', unit: 'mg/dL', description: 'Fasting capillary glucose', category: 'Labs', decimals: 0, base: 142, amp: 34 },
];

const insMetric = db.prepare(
  'INSERT OR IGNORE INTO metrics (id,label,unit,description,category,decimals) VALUES (?,?,?,?,?,?)',
);
for (const m of METRICS) insMetric.run(m.id, m.label, m.unit, m.description, m.category, m.decimals);

// Default datasets a new patient is monitored on (drag-and-drop edits this).
export const DEFAULT_MONITORED = ['weight_lb', 'spo2_pct', 'hr_bpm', 'edema_score'];

// Per-condition monitoring TEMPLATES: each chronic condition auto-fills a different,
// clinically-relevant set of charts. CHF mirrors DEFAULT_MONITORED so the hero
// patient (Mrs. R) is unchanged. The `metrics` arrays are the ordered chart grid.
export const CONDITION_TEMPLATES = [
  {
    condition: 'chf',
    label: 'Congestive heart failure',
    description: 'Fluid-overload watch: weight, oxygenation, heart rate, peripheral edema.',
    metrics: ['weight_lb', 'spo2_pct', 'hr_bpm', 'edema_score'],
  },
  {
    condition: 'copd',
    label: 'COPD',
    description: 'Airway-narrowing watch: oxygenation, peak flow, respiratory rate, heart rate, adherence.',
    metrics: ['spo2_pct', 'peak_flow', 'resp_rate', 'hr_bpm', 'med_adherence'],
  },
  {
    condition: 't2dm',
    label: 'Type 2 diabetes',
    description: 'Glycemic + cardiometabolic watch: blood glucose, weight, blood pressure, adherence.',
    metrics: ['blood_glucose', 'weight_lb', 'bp_systolic', 'med_adherence'],
  },
];

const insTemplate = db.prepare(
  'INSERT OR REPLACE INTO condition_templates (condition,label,description) VALUES (?,?,?)',
);
const insTemplateMetric = db.prepare(
  'INSERT OR REPLACE INTO template_metrics (condition,metric_id,position) VALUES (?,?,?)',
);
for (const t of CONDITION_TEMPLATES) {
  insTemplate.run(t.condition, t.label, t.description);
  t.metrics.forEach((id, i) => insTemplateMetric.run(t.condition, id, i));
}

// The ordered chart set a condition monitors (falls back to DEFAULT_MONITORED).
function templateMetrics(condition) {
  const ids = db
    .prepare('SELECT metric_id FROM template_metrics WHERE condition=? ORDER BY position')
    .all(condition)
    .map((r) => r.metric_id);
  return ids.length ? ids : DEFAULT_MONITORED;
}

// Deterministic synthetic FULL trajectory (hospital → home) for (patient, metric).
// t = 0..8: 4 hospital points (elevated, settling) + 5 home days. Stable per key.
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
function genTimeline(patientKey, m) {
  const phase = hash01(patientKey + '|' + m.id) * Math.PI * 2;
  const out = [];
  for (let t = 0; t <= 8; t++) {
    const isHosp = t < 4;
    const homeDay = t - 3; // 1..5 for the home points
    const hosp = isHosp ? ((4 - t) / 4) * m.amp * 1.3 : 0; // elevated in hospital, settles by discharge
    const wobble = Math.sin(t * 0.7 + phase);
    const noise = (hash01(`${patientKey}|${m.id}|${t}`) - 0.5) * 0.5;
    const homeDrift = isHosp ? 0 : (homeDay - 3) * m.amp * 0.12;
    let v = m.base + hosp + m.amp * (0.35 * wobble + noise) + homeDrift;
    v = m.decimals ? Math.round(v * 10) / 10 : Math.round(v);
    out.push({ t, value: v });
  }
  return out;
}

// Ensure a patient exists with a default config + a full set of synthetic series.
// Called lazily so generated/pasted patients (any key) also get monitoring data.
export function ensurePatient(key, name = 'Patient', mrn = null, condition = 'chf') {
  db.prepare('INSERT OR IGNORE INTO patients (key,name,mrn,condition) VALUES (?,?,?,?)').run(
    key,
    name,
    mrn ?? key,
    condition,
  );

  const cfgCount = db.prepare('SELECT COUNT(*) c FROM monitor_config WHERE patient_key=?').get(key).c;
  if (!cfgCount) {
    // Auto-fill the chart grid from this patient's condition template.
    const ins = db.prepare('INSERT OR IGNORE INTO monitor_config (patient_key,metric_id,position) VALUES (?,?,?)');
    templateMetrics(condition).forEach((id, i) => ins.run(key, id, i));
  }

  const serCount = db.prepare('SELECT COUNT(*) c FROM metric_series WHERE patient_key=?').get(key).c;
  if (!serCount) {
    const ins = db.prepare('INSERT OR IGNORE INTO metric_series (patient_key,metric_id,t,value) VALUES (?,?,?,?)');
    const tx = db.transaction(() => {
      for (const m of METRICS) for (const pt of genTimeline(key, m)) ins.run(key, m.id, pt.t, pt.value);
    });
    tx();
  }
}

// Seed the canonical hero patient (Mrs. R, CHF) so the demo has data out of the box.
ensurePatient('4471932', 'Margaret A. Roberts', '4471932', 'chf');

// Two additional REFERENCE patients — same shape as Mrs. R, different chronic
// conditions, all fabricated. Each auto-fills its condition's chart template, so
// the dashboard renders condition-specific charts straight from the database.
ensurePatient('5582013', 'James T. Powell', '5582013', 'copd');
ensurePatient('6693027', 'Linda K. Alvarez', '6693027', 't2dm');

export default db;
