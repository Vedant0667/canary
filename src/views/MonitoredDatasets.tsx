// Configurable monitoring layer — the clinician drag-and-drops which datasets
// they track for THIS patient. Backed by the SQLite monitoring API (server/),
// proxied at /api. The chart grid below the configurator reflects the live
// selection: drag a dataset in and its chart appears; remove it and it's gone.
// Degrades gracefully: if the backend isn't running, this section hides itself so
// the core demo is unaffected.

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
  const dropAvailable = () => {
    const id = draggedRef.current;
    endDrag();
    if (id && monitored.includes(id)) save(monitored.filter((x) => x !== id));
  };
  const add = (id: string) => save([...monitored, id]);
  const remove = (id: string) => save(monitored.filter((x) => x !== id));

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header — with a live backend indicator so the demo SHOWS it's API/DB-driven */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div className="mono" style={labelStyle}>
          Monitored datasets · drag to configure
        </div>
        <span
          className="mono"
          title="Configuration and series load from the Express + SQLite monitoring API at /api"
          style={{
            fontSize: '0.62rem',
            color: 'var(--pass-text)',
            background: 'var(--pass-bg)',
            borderRadius: 'var(--radius-pill)',
            padding: '3px 9px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span aria-hidden="true">◉</span> live · SQLite monitoring API · {data.metrics.length} datasets
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.4 }}>
        {patientName}: each clinician chooses which datasets to track. Drag between columns to add,
        remove, or reorder — the charts below update live and the choice is saved to the database
        (reload and it persists).
      </p>

      {/* Configurator: two drag-and-drop columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => dropMonitoring(null)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minHeight: 96,
            padding: 10,
            borderRadius: 12,
            background: 'var(--page)',
            border: `1px dashed ${dragId ? 'var(--slate)' : 'var(--border)'}`,
          }}
        >
          <div className="mono" style={{ ...labelStyle, fontSize: '0.6rem' }}>
            Monitoring ({monitored.length}) · drag to reorder
          </div>
          {monitored.length === 0 && (
            <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              Drag datasets here.
            </span>
          )}
          {monitored.map((id) => {
            const m = byId[id];
            if (!m) return null;
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 9px',
                  borderRadius: 8,
                  border: '0.5px solid var(--border)',
                  background: 'var(--card)',
                  cursor: 'grab',
                  opacity: dragId === id ? 0.5 : 1,
                }}
              >
                <span aria-hidden="true" className="mono" style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                  ⠿
                </span>
                <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--ink)' }}>{m.label}</span>
                <button
                  onClick={() => remove(id)}
                  aria-label={`Stop monitoring ${m.label}`}
                  className="mono"
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.9rem' }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={dropAvailable}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minHeight: 96,
            padding: 10,
            borderRadius: 12,
            background: 'var(--card)',
            border: '1px dashed var(--border)',
          }}
        >
          <div className="mono" style={{ ...labelStyle, fontSize: '0.6rem' }}>
            Available datasets · click or drag to add
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

      {/* Live chart grid — reflects exactly the monitored datasets, in order */}
      <div className="mono" style={{ ...labelStyle, fontSize: '0.6rem', marginTop: 2 }}>
        Live charts ({monitored.length})
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
        {monitored.map((id) => {
          const m = byId[id];
          if (!m) return null;
          return <MetricChart key={id} metric={m} pts={data.series[id] ?? []} />;
        })}
        {monitored.length === 0 && (
          <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
            No datasets selected — add one above to chart it.
          </span>
        )}
      </div>
    </section>
  );
}

function MetricChart({ metric, pts }: { metric: MetricDef; pts: SeriesPoint[] }) {
  const latest = pts.length ? pts[pts.length - 1].value : null;
  return (
    <div className="card-sunken" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
          {metric.label}
        </span>
        <span className="mono" style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--ink)' }}>
          {latest != null ? `${latest}${metric.unit === '%' ? '' : ' '}${metric.unit}` : '—'}
        </span>
      </div>
      <TrendLine pts={pts} decimals={metric.decimals} />
    </div>
  );
}

function TrendLine({ pts, decimals }: { pts: SeriesPoint[]; decimals: number }) {
  if (!pts || pts.length === 0) return null;
  const vals = pts.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const W = 200;
  const H = 64;
  const padX = 6;
  const padY = 8;
  const x = (i: number) => (pts.length === 1 ? W / 2 : padX + (i / (pts.length - 1)) * (W - 2 * padX));
  const y = (v: number) => H - padY - ((v - lo) / span) * (H - 2 * padY);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="trend">
      <path d={d} fill="none" stroke="var(--slate)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={p.day}>
          <circle cx={x(i)} cy={y(p.value)} r={i === pts.length - 1 ? 3 : 2} fill="var(--slate)" />
          <text x={x(i)} y={H - 1} textAnchor="middle" className="mono" fontSize={6.5} fill="var(--muted)">
            d{p.day}
          </text>
        </g>
      ))}
      <title>{pts.map((p) => `d${p.day}: ${p.value.toFixed(decimals)}`).join('  ')}</title>
    </svg>
  );
}
