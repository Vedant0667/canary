// Configurable monitoring layer — the clinician drag-and-drops which datasets
// they track for THIS patient. Backed by the SQLite monitoring API (server/),
// proxied at /api. Degrades gracefully: if the backend isn't running, this
// section quietly hides so the core demo is unaffected.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

interface MetricDef {
  id: string;
  label: string;
  unit: string;
  description: string;
  category: string;
  decimals: number;
}
interface SeriesPoint {
  day: number;
  value: number;
}
interface MonitoringData {
  config: string[];
  metrics: MetricDef[];
  series: Record<string, SeriesPoint[]>;
}

const labelStyle: CSSProperties = {
  fontSize: '0.66rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

export default function MonitoredDatasets({
  patientKey,
  patientName,
}: {
  patientKey: string;
  patientName: string;
}) {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [monitored, setMonitored] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [dragId, setDragId] = useState<string | null>(null);
  const draggedRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    fetch(`/api/patients/${encodeURIComponent(patientKey)}/monitoring`)
      .then((r) => {
        if (!r.ok) throw new Error('bad status');
        return r.json();
      })
      .then((d: MonitoringData) => {
        if (!alive) return;
        setData(d);
        setMonitored(d.config);
        setStatus('ready');
      })
      .catch(() => {
        if (alive) setStatus('offline');
      });
    return () => {
      alive = false;
    };
  }, [patientKey]);

  const save = useCallback(
    (ids: string[]) => {
      setMonitored(ids);
      fetch(`/api/patients/${encodeURIComponent(patientKey)}/monitoring/config`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ metricIds: ids }),
      }).catch(() => {
        /* optimistic — the UI already reflects the change */
      });
    },
    [patientKey],
  );

  // The backend is an optional enhancement — never break the core demo.
  if (status === 'offline') return null;
  if (status === 'loading' || !data) {
    return (
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="mono" style={labelStyle}>
          Monitored datasets
        </div>
        <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
          loading from monitoring database…
        </span>
      </section>
    );
  }

  const byId: Record<string, MetricDef> = Object.fromEntries(data.metrics.map((m) => [m.id, m]));
  const available = data.metrics.map((m) => m.id).filter((id) => !monitored.includes(id));

  const startDrag = (id: string) => {
    draggedRef.current = id;
    setDragId(id);
  };
  const endDrag = () => {
    draggedRef.current = null;
    setDragId(null);
  };

  // Drop into the monitoring list, optionally before a specific metric (reorder).
  const dropMonitoring = (beforeId: string | null) => {
    const id = draggedRef.current;
    endDrag();
    if (!id) return;
    const next = monitored.filter((x) => x !== id);
    if (beforeId == null || beforeId === id) next.push(id);
    else {
      const i = next.indexOf(beforeId);
      next.splice(i < 0 ? next.length : i, 0, id);
    }
    save(next);
  };
  // Drop back into the available list = stop monitoring.
  const dropAvailable = () => {
    const id = draggedRef.current;
    endDrag();
    if (id && monitored.includes(id)) save(monitored.filter((x) => x !== id));
  };

  const add = (id: string) => save([...monitored, id]);
  const remove = (id: string) => save(monitored.filter((x) => x !== id));

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div className="mono" style={labelStyle}>
          Monitored datasets · drag to configure
        </div>
        <span className="mono" style={{ fontSize: '0.62rem', color: 'var(--slate-text)' }}>
          {patientName} · saved to monitoring database
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.4 }}>
        Each clinician chooses which datasets to track for a patient. Drag between columns to
        add, remove, or reorder — the configuration persists per patient.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12, alignItems: 'start' }}>
        {/* MONITORING column (ordered, with sparklines) */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => dropMonitoring(null)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: 120,
            padding: 10,
            borderRadius: 12,
            background: 'var(--page)',
            border: `1px dashed ${dragId ? 'var(--slate)' : 'var(--border)'}`,
          }}
        >
          <div className="mono" style={{ ...labelStyle, fontSize: '0.6rem' }}>
            Monitoring ({monitored.length})
          </div>
          {monitored.length === 0 && (
            <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              Drag datasets here.
            </span>
          )}
          {monitored.map((id) => {
            const m = byId[id];
            if (!m) return null;
            const pts = data.series[id] ?? [];
            const latest = pts.length ? pts[pts.length - 1].value : null;
            return (
              <div
                key={id}
                draggable
                onDragStart={() => startDrag(id)}
                onDragEnd={endDrag}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.stopPropagation();
                  dropMonitoring(id);
                }}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  cursor: 'grab',
                  opacity: dragId === id ? 0.5 : 1,
                  background: 'var(--card)',
                }}
              >
                <span aria-hidden="true" className="mono" style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                  ⠿
                </span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--ink)', fontWeight: 500 }}>{m.label}</span>
                  <span className="mono" style={{ fontSize: '0.64rem', color: 'var(--muted)' }}>
                    {latest != null ? `${latest}${m.unit === '%' ? '' : ' '}${m.unit} latest` : m.description}
                  </span>
                </span>
                <Sparkline pts={pts} />
                <button
                  onClick={() => remove(id)}
                  aria-label={`Stop monitoring ${m.label}`}
                  className="mono"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    padding: '0 2px',
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {/* AVAILABLE column */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={dropAvailable}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minHeight: 120,
            padding: 10,
            borderRadius: 12,
            background: 'var(--card)',
            border: '1px dashed var(--border)',
          }}
        >
          <div className="mono" style={{ ...labelStyle, fontSize: '0.6rem' }}>
            Available datasets
          </div>
          {available.length === 0 && (
            <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              All datasets are being monitored.
            </span>
          )}
          {available.map((id) => {
            const m = byId[id];
            return (
              <div
                key={id}
                draggable
                onDragStart={() => startDrag(id)}
                onDragEnd={endDrag}
                onClick={() => add(id)}
                title={`${m.description} — click or drag to monitor`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 9px',
                  borderRadius: 'var(--radius-pill)',
                  border: '0.5px solid var(--border)',
                  background: 'var(--page)',
                  cursor: 'grab',
                  opacity: dragId === id ? 0.5 : 1,
                }}
              >
                <span aria-hidden="true" className="mono" style={{ color: 'var(--slate-text)', fontSize: '0.8rem' }}>
                  +
                </span>
                <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--ink)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: '0.58rem', color: 'var(--muted)' }}>
                  {m.category}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Sparkline({ pts }: { pts: SeriesPoint[] }) {
  if (!pts || pts.length === 0) return null;
  const vals = pts.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const W = 96;
  const H = 26;
  const pad = 3;
  const x = (i: number) => (pts.length === 1 ? W / 2 : pad + (i / (pts.length - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - 2 * pad);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={W} height={H} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={d} fill="none" stroke="var(--slate)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(last.value)} r={2.4} fill="var(--slate)" />
    </svg>
  );
}
