// Configurable monitoring UI — two pieces, both props-driven (state lives in the
// useMonitoring hook so DashboardView's chart grid and this configurator stay in
// sync):
//   • DatasetConfigurator — drag-and-drop which datasets a patient is monitored on
//   • SimpleMetricChart    — a small trend chart for a non-core dataset in the grid

import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MetricDef } from '../lib/useMonitoring';

const labelStyle: CSSProperties = {
  fontSize: '0.66rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

export function DatasetConfigurator({
  metrics,
  monitored,
  onChange,
  patientName,
}: {
  metrics: MetricDef[];
  monitored: string[];
  onChange: (ids: string[]) => void;
  patientName: string;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const draggedRef = useRef<string | null>(null);

  const byId: Record<string, MetricDef> = Object.fromEntries(metrics.map((m) => [m.id, m]));
  const available = metrics.map((m) => m.id).filter((id) => !monitored.includes(id));

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
    onChange(next);
  };
  const dropAvailable = () => {
    const id = draggedRef.current;
    endDrag();
    if (id && monitored.includes(id)) onChange(monitored.filter((x) => x !== id));
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div className="mono" style={labelStyle}>
          Monitored datasets · drag to configure
        </div>
        <span
          className="mono"
          title="Datasets, order, and series come from the Express + SQLite monitoring API at /api"
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
          <span aria-hidden="true">◉</span> live · SQLite monitoring API · {metrics.length} datasets
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>
        {patientName}: drag datasets between columns — the charts below update live, and the choice is
        saved to the database (reload and it persists).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        {/* Monitoring (ordered, drag to reorder, × to remove) */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => dropMonitoring(null)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minHeight: 88,
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
                  onClick={() => onChange(monitored.filter((x) => x !== id))}
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

        {/* Available (click or drag to add) */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={dropAvailable}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minHeight: 88,
            padding: 10,
            borderRadius: 12,
            background: 'var(--card)',
            border: '1px dashed var(--border)',
          }}
        >
          <div className="mono" style={{ ...labelStyle, fontSize: '0.6rem' }}>
            Available · click or drag to add
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
                onClick={() => onChange([...monitored, id])}
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
    </div>
  );
}
