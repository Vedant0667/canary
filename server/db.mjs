// Cardinal — home-monitoring backend datastore (SQLite via better-sqlite3).
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'cardinal.db'));
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
    mrn TEXT
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
    day INTEGER NOT NULL,
    value REAL NOT NULL,
    PRIMARY KEY (patient_key, metric_id, day)
  );
`);

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
];

const insMetric = db.prepare(
  'INSERT OR IGNORE INTO metrics (id,label,unit,description,category,decimals) VALUES (?,?,?,?,?,?)',
);
for (const m of METRICS) insMetric.run(m.id, m.label, m.unit, m.description, m.category, m.decimals);

// Default datasets a new patient is monitored on (drag-and-drop edits this).
export const DEFAULT_MONITORED = ['weight_lb', 'spo2_pct', 'hr_bpm', 'edema_score'];

// Deterministic synthetic 5-day series for (patient, metric) — stable per key.
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
function genSeries(patientKey, m) {
  const phase = hash01(patientKey + '|' + m.id) * Math.PI * 2;
  const out = [];
  for (let day = 1; day <= 5; day++) {
    const wobble = Math.sin(day * 0.9 + phase);
    const noise = (hash01(`${patientKey}|${m.id}|${day}`) - 0.5) * 0.6;
    let v = m.base + m.amp * (0.4 * wobble + noise) + (day - 3) * m.amp * 0.12;
    v = m.decimals ? Math.round(v * 10) / 10 : Math.round(v);
    out.push({ day, value: v });
  }
  return out;
}

// Ensure a patient exists with a default config + a full set of synthetic series.
// Called lazily so generated/pasted patients (any key) also get monitoring data.
export function ensurePatient(key, name = 'Patient', mrn = null) {
  db.prepare('INSERT OR IGNORE INTO patients (key,name,mrn) VALUES (?,?,?)').run(key, name, mrn ?? key);

  const cfgCount = db.prepare('SELECT COUNT(*) c FROM monitor_config WHERE patient_key=?').get(key).c;
  if (!cfgCount) {
    const ins = db.prepare('INSERT OR IGNORE INTO monitor_config (patient_key,metric_id,position) VALUES (?,?,?)');
    DEFAULT_MONITORED.forEach((id, i) => ins.run(key, id, i));
  }

  const serCount = db.prepare('SELECT COUNT(*) c FROM metric_series WHERE patient_key=?').get(key).c;
  if (!serCount) {
    const ins = db.prepare('INSERT OR IGNORE INTO metric_series (patient_key,metric_id,day,value) VALUES (?,?,?,?)');
    const tx = db.transaction(() => {
      for (const m of METRICS) for (const pt of genSeries(key, m)) ins.run(key, m.id, pt.day, pt.value);
    });
    tx();
  }
}

// Seed the canonical hero patient (Mrs. R) so the demo has data out of the box.
ensurePatient('4471932', 'Margaret A. Roberts', '4471932');

export default db;
