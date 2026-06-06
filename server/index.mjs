// Canary — home-monitoring backend API (Express + SQLite).
//
// Serves the configurable monitoring layer: the dataset catalog, each patient's
// chosen (drag-and-drop ordered) datasets, and the per-metric time series. The
// React app talks to this via the Vite dev proxy (/api/* → here).

import express from 'express';
import cors from 'cors';
import db, { ensurePatient } from './db.mjs';

const app = express();
app.use(cors());
app.use(express.json());

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

  res.json({ patientKey: key, config, metrics: metricsStmt.all(), series });
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

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`[canary] monitor API → http://localhost:${PORT}  (GET /api/health)`);
});
