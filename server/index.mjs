// Canary — home-monitoring backend API (Express + SQLite).
//
// Serves the configurable monitoring layer: the dataset catalog, each patient's
// chosen (drag-and-drop ordered) datasets, and the per-metric time series. The
// React app talks to this via the Vite dev proxy (/api/* → here).

import express from 'express';
import cors from 'cors';
import db, { ensurePatient } from './db.mjs';
// The clinical engine — the SAME deterministic TypeScript modules the tests use,
// imported and executed server-side (the server runs via tsx). Clinical logic
// lives on the backend; the frontend renders what the engine returns.
import { scoreEligibility, assessTrend } from '../src/engine/scoring.ts';
import { synthesizeTrajectory, MRS_R_SERIES, MRS_R_TIMELINE } from '../src/data/monitoring.ts';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const nowIso = () => new Date().toISOString();

const metricsStmt = db.prepare('SELECT id,label,unit,description,category,decimals FROM metrics');

app.get('/api/health', (_req, res) => {
  const counts = {
    metrics: db.prepare('SELECT COUNT(*) c FROM metrics').get().c,
    patients: db.prepare('SELECT COUNT(*) c FROM patients').get().c,
    series_rows: db.prepare('SELECT COUNT(*) c FROM metric_series').get().c,
  };
  res.json({ ok: true, service: 'canary-monitor', db: counts });
});

// The full catalog of datasets a clinician can choose to monitor.
app.get('/api/metrics', (_req, res) => {
  res.json(metricsStmt.all());
});

// The discharge packets (triage inputs): raw paperwork + canonical extraction,
// served from the database. The app fetches these instead of bundling them.
const packetsStmt = db.prepare(
  'SELECT id,label,blurb,raw_text,cached_record FROM packets ORDER BY position',
);
app.get('/api/packets', (_req, res) => {
  res.json(
    packetsStmt.all().map((p) => ({
      id: p.id,
      label: p.label,
      blurb: p.blurb,
      rawText: p.raw_text,
      cachedRecord: JSON.parse(p.cached_record),
    })),
  );
});

// Everything the configurable dashboard needs for one patient: the catalog, the
// ordered monitored set, and the series for each metric.
app.get('/api/patients/:key/monitoring', (req, res) => {
  const key = String(req.params.key);
  ensurePatient(key, String(req.query.name ?? 'Patient'), key);

  const config = db
    .prepare('SELECT metric_id FROM monitor_config WHERE patient_key=? ORDER BY position')
    .all(key)
    .map((r) => r.metric_id);

  const seriesRows = db
    .prepare('SELECT metric_id, t, value FROM metric_series WHERE patient_key=? ORDER BY metric_id, t')
    .all(key);
  const series = {};
  for (const r of seriesRows) (series[r.metric_id] ??= []).push({ t: r.t, value: r.value });

  const p = db
    .prepare(
      'SELECT p.name, p.mrn, p.condition, c.label AS conditionLabel FROM patients p LEFT JOIN condition_templates c ON c.condition = p.condition WHERE p.key = ?',
    )
    .get(key);

  res.json({
    patientKey: key,
    name: p?.name ?? null,
    condition: p?.condition ?? null,
    conditionLabel: p?.conditionLabel ?? null,
    config,
    metrics: metricsStmt.all(),
    series,
  });
});

// The chart templates per chronic condition: each condition auto-fills a
// different, clinically-relevant set of datasets (resolved to full metric defs).
app.get('/api/conditions', (_req, res) => {
  const byId = Object.fromEntries(metricsStmt.all().map((m) => [m.id, m]));
  const templates = db.prepare('SELECT condition,label,description FROM condition_templates').all();
  res.json(
    templates.map((t) => ({
      ...t,
      metrics: db
        .prepare('SELECT metric_id FROM template_metrics WHERE condition=? ORDER BY position')
        .all(t.condition)
        .map((r) => byId[r.metric_id])
        .filter(Boolean),
    })),
  );
});

// Every patient on file, with their condition (drives the reference-patient picker).
app.get('/api/patients', (_req, res) => {
  res.json(
    db
      .prepare(
        'SELECT p.key, p.name, p.mrn, p.condition, c.label AS conditionLabel FROM patients p LEFT JOIN condition_templates c ON c.condition = p.condition ORDER BY p.condition, p.name',
      )
      .all(),
  );
});

// Persist the clinician's drag-and-drop choice: the ordered list of monitored datasets.
app.put('/api/patients/:key/monitoring/config', (req, res) => {
  const key = String(req.params.key);
  const ids = Array.isArray(req.body?.metricIds) ? req.body.metricIds.map(String) : [];
  ensurePatient(key, 'Patient', key);

  const valid = new Set(metricsStmt.all().map((m) => m.id));
  const clean = ids.filter((id) => valid.has(id));

  const del = db.prepare('DELETE FROM monitor_config WHERE patient_key=?');
  const ins = db.prepare('INSERT INTO monitor_config (patient_key,metric_id,position) VALUES (?,?,?)');
  db.transaction(() => {
    del.run(key);
    clean.forEach((id, i) => ins.run(key, id, i));
  })();

  res.json({ ok: true, patientKey: key, config: clean });
});

// ── Clinical compute (engine runs here, results persisted) ─────────────────────

const insRecord = db.prepare(
  'INSERT OR REPLACE INTO patient_records (patient_key,record_json,source,created_at) VALUES (?,?,?,?)',
);
const insScore = db.prepare(
  'INSERT OR REPLACE INTO readiness_scores (patient_key,overall,band,result_json,computed_at) VALUES (?,?,?,?,?)',
);
const insTrend = db.prepare(
  'INSERT OR REPLACE INTO trend_assessments (patient_key,day,tier,result_json,computed_at) VALUES (?,?,?,?,?)',
);

// Home-readiness scoring. The patient record (input) is persisted, the engine
// computes the score + k-NN case confidence, and the result is stored + returned.
app.post('/api/patients/:key/score', (req, res) => {
  const key = String(req.params.key);
  const record = req.body?.record;
  if (!record || typeof record !== 'object') {
    return res.status(400).json({ error: 'body.record (PatientRecord) is required' });
  }
  try {
    ensurePatient(key, record.name ?? 'Patient', record.mrn ?? key);
    const score = scoreEligibility(record);
    const ts = nowIso();
    insRecord.run(key, JSON.stringify(record), String(req.body?.source ?? 'live'), ts);
    insScore.run(key, score.overall, score.band, JSON.stringify(score), ts);
    res.json({ patientKey: key, score, computedAt: ts });
  } catch (err) {
    console.error('[canary] score error:', err);
    res.status(500).json({ error: 'scoring failed', detail: String(err?.message ?? err) });
  }
});

// The home-monitoring trajectory (hospital→home arc + the 5 home readings).
// Mrs. R ships a hand-authored series; everyone else gets one synthesized from
// their own discharge vitals — computed by the engine, here on the backend.
app.post('/api/patients/:key/trajectory', (req, res) => {
  const record = req.body?.record;
  const packetId = String(req.body?.packetId ?? '');
  try {
    const traj =
      packetId === 'mrs-r' || !record
        ? { series: MRS_R_SERIES, timeline: MRS_R_TIMELINE }
        : synthesizeTrajectory(record);
    res.json(traj);
  } catch (err) {
    console.error('[canary] trajectory error:', err);
    res.status(500).json({ error: 'trajectory failed', detail: String(err?.message ?? err) });
  }
});

// Daily monitoring tiers. Given the home series + provider-reported symptoms,
// the engine assesses each day's trend tier vs the days 1–2 baseline; every day
// is computed on the backend and stored. Returns the per-day TierResult array.
app.post('/api/patients/:key/trends', (req, res) => {
  const key = String(req.params.key);
  const series = Array.isArray(req.body?.series) ? req.body.series : null;
  const symptomByDay = req.body?.symptomByDay ?? {};
  if (!series) return res.status(400).json({ error: 'body.series (Reading[]) is required' });
  try {
    const baseline = series.slice(0, 2);
    const ts = nowIso();
    const tiers = series.map((reading) => {
      const result = assessTrend(baseline, reading, symptomByDay[reading.day] ?? null);
      insTrend.run(key, reading.day, result.tier, JSON.stringify(result), ts);
      return result;
    });
    res.json({ patientKey: key, tiers, computedAt: ts });
  } catch (err) {
    console.error('[canary] trends error:', err);
    res.status(500).json({ error: 'trends failed', detail: String(err?.message ?? err) });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`[canary] monitor API → http://localhost:${PORT}  (GET /api/health)`);
});
