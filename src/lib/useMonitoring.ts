// Monitoring-config hook — loads the patient's configurable datasets + series from
// the SQLite monitoring API (server/, proxied at /api) and persists changes.
// Used by DashboardView to drive a config-driven chart grid, and by the
// drag-and-drop configurator. Fails soft: `status: 'offline'` lets callers fall
// back to the built-in core charts so the demo never breaks.

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface MetricDef {
  id: string;
  label: string;
  unit: string;
  description: string;
  category: string;
  decimals: number;
}
export interface SeriesPoint {
  t: number; // 0..8 timeline index (4 hospital + 5 home), matches the chart arc
  value: number;
}

export interface MonitoringState {
  status: 'loading' | 'ready' | 'offline';
  metrics: MetricDef[];
  metricById: Record<string, MetricDef>;
  series: Record<string, SeriesPoint[]>;
  monitored: string[];
  setMonitored: (ids: string[]) => void;
}

export function useMonitoring(patientKey: string): MonitoringState {
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [series, setSeries] = useState<Record<string, SeriesPoint[]>>({});
  const [monitored, setMon] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    fetch(`/api/patients/${encodeURIComponent(patientKey)}/monitoring`)
      .then((r) => {
        if (!r.ok) throw new Error('bad status');
        return r.json();
      })
      .then((d: { metrics: MetricDef[]; series: Record<string, SeriesPoint[]>; config: string[] }) => {
        if (!alive) return;
        setMetrics(d.metrics);
        setSeries(d.series);
        setMon(d.config);
        setStatus('ready');
      })
      .catch(() => {
        if (alive) setStatus('offline');
      });
    return () => {
      alive = false;
    };
  }, [patientKey]);

  const setMonitored = useCallback(
    (ids: string[]) => {
      setMon(ids);
      fetch(`/api/patients/${encodeURIComponent(patientKey)}/monitoring/config`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ metricIds: ids }),
      }).catch(() => {
        /* optimistic — UI already updated */
      });
    },
    [patientKey],
  );

  const metricById = useMemo(() => Object.fromEntries(metrics.map((m) => [m.id, m])), [metrics]);

  return { status, metrics, metricById, series, monitored, setMonitored };
}
