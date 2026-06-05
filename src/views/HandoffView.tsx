// View ② — Hand-off (PRD §4 View 2 / design §4 HandoffViewProps).
// Pure renderer: shows the Cardinal Continuity Record (real FHIR resource
// names, built from `record`) on the LEFT, and a deliberately plainer/grayer
// generic-EMR "Accura Home Health — intake" mock on the RIGHT. Send animates a
// transfer; the right side auto-populates field by field; nothing is re-collected,
// no studies re-ordered. "UI never computes clinically" — we only render `record`.

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Device,
  PatientRecord,
  ScoreResult,
  Vitals,
} from '../types';
import { Chip } from '../components/primitives';

interface HandoffViewProps {
  record: PatientRecord;
  scoreResult: ScoreResult;
  sent: boolean;
  onSend: () => void;
  onContinue: () => void; // advance to monitoring once the transfer is visible
}

// ---------------------------------------------------------------------------
// FHIR resource model — derived purely from `record`. These are real resource
// shapes (Patient, Condition, MedicationStatement, Observation, DiagnosticReport,
// CarePlan), not a clinical computation.
// ---------------------------------------------------------------------------

const DEVICE_LABEL: Record<Device, string> = {
  scale: 'Connected scale',
  bp_cuff: 'BP cuff',
  pulse_ox: 'Pulse oximeter',
  ecg_patch: 'ECG patch',
};

interface IntakeField {
  key: string;
  label: string; // generic-EMR field label
  value: string;
}

// Flat list of fields the homecare intake form would otherwise re-collect by
// phone. Order = the order they populate when Send fires.
function intakeFields(record: PatientRecord): IntakeField[] {
  const v = record.vitals;
  const f: IntakeField[] = [];
  const push = (key: string, label: string, value: string | number | null) => {
    f.push({ key, label, value: value == null ? '—' : String(value) });
  };

  push('name', 'Patient name', record.name);
  push('age', 'Age', record.age);
  push('mrn', 'MRN', record.mrn);
  push('dx', 'Primary diagnosis', 'CHF · ICD-10 I50.9');
  push('hr', 'Heart rate (bpm)', v.hr_bpm);
  push(
    'bp',
    'Blood pressure (mmHg)',
    v.bp_systolic != null && v.bp_diastolic != null
      ? `${v.bp_systolic}/${v.bp_diastolic}`
      : null,
  );
  push('spo2', 'SpO₂ (%)', v.spo2_pct);
  push('weight', 'Weight (lb)', v.weight_lb);
  push(
    'caregiver',
    'Caregiver',
    record.home.caregiver ? record.home.caregiver.replace('_', '-') : null,
  );
  push(
    'meds',
    'Medication admin',
    record.home.med_self_admin
      ? record.home.med_self_admin === 'yes'
        ? 'self'
        : record.home.med_self_admin
      : null,
  );
  push(
    'devices',
    'Monitoring devices',
    record.devices_available.length
      ? record.devices_available.map((d) => DEVICE_LABEL[d]).join(', ')
      : null,
  );
  return f;
}

// ---------------------------------------------------------------------------
// Collapsible FHIR tree (LEFT)
// ---------------------------------------------------------------------------

function Caret({ open }: { open: boolean }) {
  return (
    <span
      className="mono"
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 12,
        transition: 'transform var(--dur-fast) var(--ease-out)',
        transform: open ? 'rotate(90deg)' : 'none',
        color: 'var(--muted)',
        fontSize: '0.7rem',
      }}
    >
      ▸
    </span>
  );
}

function ResourceNode({
  resource,
  badge,
  highlight,
  highlightChip,
  defaultOpen = true,
  children,
}: {
  resource: string; // FHIR resource name, e.g. "Patient"
  badge?: string; // e.g. "I50.9"
  highlight?: boolean; // slate-tinted (the echo reference line)
  highlightChip?: string; // chip text shown on the resource header
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: 'var(--border-w) solid var(--border)',
        borderRadius: 10,
        background: highlight ? 'var(--slate-fill)' : 'var(--page)',
        borderColor: highlight ? 'var(--slate-chip)' : 'var(--border)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mono"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: '8px 10px',
          fontSize: '0.82rem',
          color: 'var(--ink)',
          fontWeight: 500,
        }}
      >
        <Caret open={open} />
        <span style={{ color: highlight ? 'var(--slate-text)' : 'var(--ink)', fontWeight: 500 }}>
          {resource}
        </span>
        {badge && (
          <span
            className="mono"
            style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.74rem' }}
          >
            {badge}
          </span>
        )}
        {highlightChip && (
          <span style={{ marginLeft: 'auto' }}>
            <Chip tone="slate">{highlightChip}</Chip>
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            padding: '2px 12px 10px 30px',
            display: 'grid',
            gap: 3,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function Field({
  k,
  v,
  muted,
}: {
  k: string;
  v: string | number | boolean | null;
  muted?: boolean;
}) {
  return (
    <div
      className="mono"
      style={{
        display: 'flex',
        gap: 8,
        fontSize: '0.78rem',
        lineHeight: 1.7,
      }}
    >
      <span style={{ color: 'var(--muted)', minWidth: 132 }}>{k}</span>
      <span style={{ color: muted ? 'var(--muted)' : 'var(--ink)' }}>
        {v == null || v === '' ? '—' : String(v)}
      </span>
    </div>
  );
}

// A representative guideline-directed CHF regimen rendered as MedicationStatement
// resources. The PatientRecord type carries no med list, so these are part of the
// continuity-record mock — shown to make the "nothing re-collected" point concrete.
const MED_STATEMENTS = [
  { drug: 'Furosemide', dose: '40 mg', freq: 'BID', code: 'RxNorm 4603' },
  { drug: 'Lisinopril', dose: '10 mg', freq: 'daily', code: 'RxNorm 29046' },
  { drug: 'Metoprolol succinate', dose: '50 mg', freq: 'daily', code: 'RxNorm 866924' },
];

function vitalObservations(v: Vitals): { label: string; value: string; loinc: string }[] {
  const rows: { label: string; value: string; loinc: string }[] = [];
  const add = (label: string, value: string | number | null, loinc: string) => {
    if (value != null) rows.push({ label, value: String(value), loinc });
  };
  add('Heart rate', v.hr_bpm != null ? `${v.hr_bpm} bpm` : null, 'LOINC 8867-4');
  add(
    'Blood pressure',
    v.bp_systolic != null && v.bp_diastolic != null
      ? `${v.bp_systolic}/${v.bp_diastolic} mmHg`
      : null,
    'LOINC 85354-9',
  );
  add('SpO₂', v.spo2_pct != null ? `${v.spo2_pct} %` : null, 'LOINC 59408-5');
  add('Respiratory rate', v.resp_rate != null ? `${v.resp_rate} /min` : null, 'LOINC 9279-1');
  add('Body temperature', v.temp_c != null ? `${v.temp_c} °C` : null, 'LOINC 8310-5');
  add('Body weight', v.weight_lb != null ? `${v.weight_lb} lb` : null, 'LOINC 29463-7');
  return rows;
}

function ContinuityRecord({
  record,
  showRaw,
  onToggleRaw,
}: {
  record: PatientRecord;
  showRaw: boolean;
  onToggleRaw: () => void;
}) {
  const obs = useMemo(() => vitalObservations(record.vitals), [record.vitals]);
  const raw = useMemo(() => JSON.stringify(record, null, 2), [record]);

  return (
    <section
      className="card"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}
    >
      <header
        style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
      >
        <span
          className="mono"
          style={{ fontSize: '0.7rem', letterSpacing: '0.04em', color: 'var(--slate-text)' }}
        >
          CARELOOP CONTINUITY RECORD
        </span>
        <Chip tone="slate">FHIR R4</Chip>
        <button
          onClick={onToggleRaw}
          aria-pressed={showRaw}
          className="mono"
          style={{
            marginLeft: 'auto',
            background: showRaw ? 'var(--slate-chip)' : 'transparent',
            color: 'var(--slate-text)',
            border: 'var(--border-w) solid var(--slate-chip)',
            borderRadius: 'var(--radius-pill)',
            padding: '3px 12px',
            fontSize: '0.74rem',
          }}
        >
          {showRaw ? 'hide raw FHIR' : 'view raw FHIR'}
        </button>
      </header>

      {showRaw ? (
        <pre
          className="mono"
          style={{
            margin: 0,
            background: 'var(--page)',
            border: 'var(--border-w) solid var(--border)',
            borderRadius: 10,
            padding: 12,
            fontSize: '0.72rem',
            lineHeight: 1.55,
            overflowX: 'auto',
            color: 'var(--ink)',
            maxHeight: 520,
          }}
        >
          {raw}
        </pre>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <ResourceNode resource="Patient">
            <Field k="name" v={record.name} />
            <Field k="age" v={record.age != null ? `${record.age} yr` : null} />
            <Field k="identifier" v={record.mrn ? `MRN ${record.mrn}` : null} />
          </ResourceNode>

          <ResourceNode resource="Condition" badge="I50.9">
            <Field k="code" v="Heart failure, unspecified" />
            <Field k="clinicalStatus" v="active" />
            <Field k="category" v="problem-list-item" />
          </ResourceNode>

          <ResourceNode resource="MedicationStatement[]" badge={`×${MED_STATEMENTS.length}`}>
            {MED_STATEMENTS.map((m) => (
              <Field
                key={m.drug}
                k={m.drug}
                v={`${m.dose} · ${m.freq} · ${m.code}`}
              />
            ))}
          </ResourceNode>

          <ResourceNode resource="Observation[]" badge={`×${obs.length} · vitals`}>
            {obs.map((o) => (
              <Field key={o.label} k={o.label} v={`${o.value} · ${o.loinc}`} />
            ))}
          </ResourceNode>

          <ResourceNode
            resource="DiagnosticReport"
            highlight
            highlightChip="travels with patient — not re-run"
          >
            <Field k="code" v="Echocardiogram (transthoracic)" />
            <Field k="status" v="final · reference" />
            <Field k="conclusion" v="LVEF 38% · reduced" />
            <Field k="presentedForm" v="echo-2026-05-29.pdf (reference)" muted />
          </ResourceNode>

          <ResourceNode resource="CarePlan">
            <Field k="intent" v="plan · hospital-at-home" />
            <Field
              k="goal"
              v="Daily weight + SpO₂; nurse visit cadence per Watch tier"
            />
            <Field
              k="supportingDevice"
              v={
                record.devices_available.length
                  ? record.devices_available.map((d) => DEVICE_LABEL[d]).join(', ')
                  : null
              }
            />
          </ResourceNode>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Accura Home Health intake (RIGHT) — deliberately plainer / grayer generic-EMR.
// Hard-coded neutral grays here are intentional system-differentiation, NOT a
// clinical tier (those stay slate/tier-only on the Cardinal side).
// ---------------------------------------------------------------------------

const EMR_BORDER = '#cfcabf';
const EMR_LABEL = '#7c776d';
const EMR_BG = '#f3f2ee';

function AccuraIntake({
  fields,
  populatedCount,
  sent,
}: {
  fields: IntakeField[];
  populatedCount: number; // how many fields have flown in so far
  sent: boolean;
}) {
  return (
    <section
      style={{
        background: '#fcfcfb',
        border: `1px solid ${EMR_BORDER}`,
        borderRadius: 4,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontFamily: 'var(--font-body)',
        minWidth: 0,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingBottom: 8,
          borderBottom: `1px solid ${EMR_BORDER}`,
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 3,
            background: '#9a958b',
            display: 'inline-block',
          }}
          aria-hidden="true"
        />
        <span
          className="mono"
          style={{ fontSize: '0.82rem', color: '#4a463f', fontWeight: 500 }}
        >
          Accura Home Health
        </span>
        <span
          className="mono"
          style={{ fontSize: '0.7rem', color: EMR_LABEL, marginLeft: 'auto' }}
        >
          intake · v3.2
        </span>
      </header>

      {sent && populatedCount >= fields.length && (
        <div
          className="cl-rise"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--slate-fill)',
            color: 'var(--slate-text)',
            border: '0.5px solid var(--slate-chip)',
            borderRadius: 4,
            padding: '7px 10px',
          }}
          role="status"
        >
          <span aria-hidden="true">✓</span>
          <span className="mono" style={{ fontSize: '0.76rem' }}>
            Intake complete · 0 fields re-collected · 0 studies re-ordered
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gap: 7 }}>
        {fields.map((f, i) => {
          const filled = i < populatedCount;
          return (
            <label
              key={f.key}
              style={{ display: 'grid', gap: 3 }}
            >
              <span
                className="mono"
                style={{ fontSize: '0.68rem', color: EMR_LABEL, letterSpacing: '0.02em' }}
              >
                {f.label}
              </span>
              <div
                className="mono"
                style={{
                  border: `1px solid ${EMR_BORDER}`,
                  borderRadius: 3,
                  background: filled ? '#fff' : EMR_BG,
                  padding: '5px 8px',
                  fontSize: '0.78rem',
                  minHeight: 28,
                  color: filled ? '#34302a' : 'transparent',
                  transition:
                    'opacity var(--dur) var(--ease-out), transform var(--dur) var(--ease-out)',
                  opacity: filled ? 1 : 0.4,
                  transform: filled ? 'none' : 'translateY(2px)',
                }}
              >
                {filled ? f.value : ' '}
              </div>
            </label>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Transfer overlay — fields fly/fade across (~2s). Decorative only.
// ---------------------------------------------------------------------------

function TransferBeam({ active }: { active: boolean }) {
  if (!active) return null;
  // Packets ride the full width of the split (left record → right intake),
  // staggered so the stream reads as a continuous left-to-right delivery.
  const packets = [0, 1, 2, 3, 4, 5];
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {packets.map((i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: `${20 + i * 12}%`,
            left: '6%',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--slate)',
            animation: `cardinal-fly 1.05s ${i * 0.12}s var(--ease-out) infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes cardinal-fly {
          0%   { transform: translateX(0) scale(0.7); opacity: 0; }
          12%  { opacity: 0.95; }
          80%  { opacity: 0.95; }
          100% { transform: translateX(88%) scale(0.55); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export default function HandoffView({ record, scoreResult, sent, onSend, onContinue }: HandoffViewProps) {
  void scoreResult; // band drives upstream gating; not rendered clinically here.
  const fields = useMemo(() => intakeFields(record), [record]);
  const [showRaw, setShowRaw] = useState(false);
  const [transferring, setTransferring] = useState(false);
  // How many intake fields have populated. When already sent (revisit), full.
  const [populated, setPopulated] = useState(sent ? fields.length : 0);
  const timers = useRef<number[]>([]);

  // Keep populated in sync if the view mounts already-sent.
  useEffect(() => {
    if (sent && !transferring) setPopulated(fields.length);
  }, [sent, fields.length, transferring]);

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const runSend = () => {
    if (transferring) return;
    setTransferring(true);
    setPopulated(0);
    onSend(); // unlock Monitoring immediately; animation is cosmetic.

    const fieldStart = 700; // beam travels first
    const stagger = 130;
    fields.forEach((_, i) => {
      const t = window.setTimeout(() => {
        setPopulated(i + 1);
      }, fieldStart + i * stagger);
      timers.current.push(t);
    });
    const end = window.setTimeout(() => {
      setTransferring(false);
    }, fieldStart + fields.length * stagger + 200);
    timers.current.push(end);
  };

  const complete = sent && populated >= fields.length && !transferring;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 className="display" style={{ margin: 0, fontSize: '1.5rem' }}>
          Hand-off
        </h2>
        <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
          Continuity record · two systems · nothing re-collected
        </span>
      </header>

      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
            gap: 14,
            alignItems: 'start',
          }}
        >
          <ContinuityRecord
            record={record}
            showRaw={showRaw}
            onToggleRaw={() => setShowRaw((s) => !s)}
          />

          {/* Center — direction + send */}
          <div
            style={{
              alignSelf: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              minWidth: 132,
            }}
          >
            <span
              className="mono"
              aria-hidden="true"
              style={{
                color: complete ? 'var(--slate)' : 'var(--slate-text)',
                fontSize: '1.2rem',
                transition: 'color var(--dur) var(--ease-out)',
              }}
            >
              ⟶
            </span>
            <button
              onClick={runSend}
              disabled={transferring || complete}
              className="mono"
              style={{
                border: '0.5px solid var(--slate)',
                color: complete ? 'var(--slate-text)' : transferring ? 'var(--slate-text)' : '#fff',
                background: complete
                  ? 'var(--slate-fill)'
                  : transferring
                    ? 'var(--slate-chip)'
                    : 'var(--slate)',
                borderColor: 'var(--slate)',
                borderRadius: 'var(--radius-pill)',
                padding: '8px 20px',
                fontSize: '0.82rem',
                fontWeight: 500,
                cursor: transferring || complete ? 'default' : 'pointer',
                transition:
                  'background var(--dur) var(--ease-out), color var(--dur) var(--ease-out)',
              }}
            >
              {complete ? 'sent ✓' : transferring ? 'sending…' : 'Send'}
            </button>
            <span
              className="mono"
              style={{
                fontSize: '0.66rem',
                color: 'var(--muted)',
                textAlign: 'center',
                transition: 'color var(--dur) var(--ease-out)',
              }}
            >
              {complete ? 'FHIR bundle delivered' : 'transmit FHIR bundle'}
            </span>
          </div>

          <AccuraIntake fields={fields} populatedCount={populated} sent={sent} />
        </div>

        <TransferBeam active={transferring} />
      </div>

      <div
        className="card-sunken"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          padding: '8px 12px',
        }}
      >
        <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
          today, this hand-off is a fax and a phone call
        </span>
        {complete && (
          <button className="btn-primary cl-rise" onClick={onContinue}>
            Continue to monitoring ▸
          </button>
        )}
      </div>
    </div>
  );
}
