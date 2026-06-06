// Condition templates · reference patients (ADDITIVE, read-only).
//
// Reads the per-condition chart TEMPLATES and the reference patients straight from
// the SQLite monitoring API. Picking a patient renders the exact chart grid their
// chronic condition auto-fills — every series comes from the database, none of it
// hardcoded here. Self-contained: if the backend is unreachable it renders nothing,
// so the core demo is never affected.

import { useEffect, useState } from 'react';

interface MetricDef {
  id: string;
  label: string;
  unit: string;
  description: string;
  category: string;
  decimals: number;
}
interface Patient {
  key: string;
  name: string;
  mrn: string;
  condition: string;
  conditionLabel: string | null;
}
interface Template {
  condition: string;
  label: string;
  description: string;
  metrics: MetricDef[];
}
interface Monitoring {
  name: string | null;
  condition: string | null;
  conditionLabel: string | null;
  config: string[];
  metrics: MetricDef[];
  series: Record<string, { t: number; value: number }[]>;
}

// The shared 9-point hospital→home structure (matches the backend `t` index).
const STRUCT: { t: number; label: string; phase: 'hospital' | 'home' }[] = [
  { t: 0, label: 'Adm', phase: 'hospital' },
  { t: 1, label: 'H2', phase: 'hospital' },
  { t: 2, label: 'H3', phase: 'hospital' },
  { t: 3, label: 'H4', phase: 'hospital' },
  { t: 4, label: 'D1', phase: 'home' },
  { t: 5, label: 'D2', phase: 'home' },
  { t: 6, label: 'D3', phase: 'home' },
  { t: 7, label: 'D4', phase: 'home' },
  { t: 8, label: 'D5', phase: 'home' },
];
const SENT_HOME = 3.5; // boundary between the last hospital point and home day 1

const labelStyle = {
  fontSize: '0.66rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--muted)',
};

export default function ReferenceLibrary() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // The chart template to render. Auto-selects to the chosen patient's condition,
  // but can be overridden to view this patient's data through another template.
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [mon, setMon] = useState<Monitoring | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline'>('loading');

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch('/api/patients').then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch('/api/conditions').then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([ps, ts]: [Patient[], Template[]]) => {
        if (!alive) return;
        setPatients(ps);
        setTemplates(ts);
        // Default to the first non-CHF reference patient so condition-specific
        // charts are visible immediately (Mrs. R is the hero on the main flow).
        const ref = ps.find((p) => p.condition !== 'chf') ?? ps[0];
        setSelectedKey(ref?.key ?? null);
        setSelectedCondition(ref?.condition ?? null);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('offline'));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedKey) return;
    let alive = true;
    fetch(`/api/patients/${encodeURIComponent(selectedKey)}/monitoring`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Monitoring) => alive && setMon(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selectedKey]);

  // Picking a patient auto-selects their condition's template. Overriding the
  // template afterwards leaves the patient untouched (this only fires on patient
  // change), so the auto-selection is a default, not a lock.
  useEffect(() => {
    const p = patients.find((x) => x.key === selectedKey);
    if (p) setSelectedCondition(p.condition);
  }, [selectedKey, patients]);

  const selectedPatient = patients.find((p) => p.key === selectedKey);
  const template = templates.find((t) => t.condition === selectedCondition);

  // Additive panel: if the backend is down, render nothing (demo never breaks).
  if (status !== 'ready' || patients.length === 0) return null;

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div className="mono" style={labelStyle}>
          Condition templates · reference patients
        </div>
        <span
          className="mono"
          title="Templates, patients, and every series come from the Express + SQLite API at /api — picking a condition auto-fills its chart grid."
          style={{
            fontSize: '0.62rem',
            color: 'var(--pass-text)',
            background: 'var(--pass-bg)',
            borderRadius: 'var(--radius-pill)',
            padding: '3px 9px',
          }}
        >
          ⛁ from database
        </span>
      </div>

      {/* Two columns: selectors on the left, the auto-filled chart grid on the right. */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* LEFT — patient selector + (auto-selected, overridable) template selector. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 216, flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="mono" style={{ ...labelStyle, fontSize: '0.6rem' }}>
              Patient
            </div>
            {patients.map((p) => {
              const sel = p.key === selectedKey;
              return (
                <button
                  key={p.key}
                  onClick={() => setSelectedKey(p.key)}
                  aria-pressed={sel}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                    padding: '8px 12px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: sel ? 'var(--slate-fill)' : 'var(--page)',
                    border: sel ? '0.5px solid var(--slate)' : '0.5px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '0.84rem', fontWeight: 500, color: 'var(--ink)' }}>{p.name}</span>
                  <span className="mono" style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>
                    {p.conditionLabel ?? p.condition} · MRN {p.mrn}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="mono" style={{ ...labelStyle, fontSize: '0.6rem' }}>
              Chart template
            </div>
            {templates.map((t) => {
              const sel = t.condition === selectedCondition;
              const auto = t.condition === selectedPatient?.condition;
              return (
                <button
                  key={t.condition}
                  onClick={() => setSelectedCondition(t.condition)}
                  aria-pressed={sel}
                  title={t.description}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '7px 12px',
                    borderRadius: 'var(--radius-pill)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: sel ? 'var(--ink)' : 'var(--page)',
                    color: sel ? 'var(--page)' : 'var(--ink)',
                    border: sel ? '0.5px solid var(--ink)' : '0.5px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>{t.label}</span>
                  {auto && (
                    <span
                      className="mono"
                      style={{ fontSize: '0.54rem', letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.75 }}
                    >
                      auto
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT — selected template description + its chart grid (this patient's DB series). */}
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {template && (
            <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.45, color: 'var(--ink)' }}>
              <strong style={{ fontWeight: 500 }}>{template.label} template</strong> · {template.metrics.length}{' '}
              datasets{selectedPatient ? ` · ${selectedPatient.name}` : ''}
              {template.condition !== selectedPatient?.condition && (
                <span className="mono" style={{ color: 'var(--muted)' }}> · viewing through an alternate template</span>
              )}
              {' — '}
              {template.description}
            </p>
          )}

          {template && mon && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
              {template.metrics.map((m) => {
                const pts = mon.series[m.id] ?? [];
                if (pts.length === 0) return null;
                return <CompactChart key={m.id} metric={m} points={pts} />;
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// A compact hospital→home trend chart for one dataset. Pure renderer over the
// database series — no clinical logic, no hardcoded values.
function CompactChart({ metric, points }: { metric: MetricDef; points: { t: number; value: number }[] }) {
  const W = 320;
  const H = 110;
  const padL = 10;
  const padR = 10;
  const padT = 14;
  const padB = 18;
  const plotW = W - padL - padR;
  const plotTop = padT;
  const plotBottom = H - padB;

  const valueByT = new Map(points.map((p) => [p.t, p.value]));
  const series = STRUCT.map((s) => ({ ...s, value: valueByT.get(s.t) ?? 0 }));
  const vals = series.map((s) => s.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.14 || 1;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const x = (t: number) => padL + (t / 8) * plotW;
  const y = (v: number) => plotBottom - ((v - yMin) / (yMax - yMin)) * (plotBottom - plotTop);
  const line = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.t).toFixed(1)},${y(s.value).toFixed(1)}`).join(' ');
  const latest = series[series.length - 1].value;

  return (
    <div className="card-sunken" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
          {metric.label}
        </span>
        <span className="mono" style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--ink)' }}>
          {latest.toFixed(metric.decimals)} {metric.unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`${metric.label} trend, hospital through home`}>
        {/* hospital-phase shading */}
        <rect x={x(0)} y={plotTop} width={x(SENT_HOME) - x(0)} height={plotBottom - plotTop} fill="var(--slate-fill)" opacity={0.7} />
        {/* sent-home reference line */}
        <line x1={x(SENT_HOME)} y1={plotTop - 4} x2={x(SENT_HOME)} y2={plotBottom} stroke="var(--ink)" strokeWidth={0.75} strokeDasharray="3 3" opacity={0.5} />
        <text x={x(SENT_HOME)} y={plotTop - 6} textAnchor="middle" className="mono" fontSize={7} fill="var(--muted)">
          sent home
        </text>
        {/* trend line */}
        <path d={line} fill="none" stroke="var(--slate)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        {/* points + axis labels */}
        {series.map((s) => (
          <g key={s.t}>
            <circle cx={x(s.t)} cy={y(s.value)} r={s.phase === 'home' ? 2.6 : 2.2} fill={s.phase === 'home' ? 'var(--slate)' : 'var(--card)'} stroke={s.phase === 'home' ? 'none' : 'var(--muted)'} strokeWidth={1}>
              <title>{`${s.label}: ${s.value.toFixed(metric.decimals)} ${metric.unit}`}</title>
            </circle>
            <text x={x(s.t)} y={H - 5} textAnchor="middle" className="mono" fontSize={6.5} fill="var(--muted)">
              {s.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
