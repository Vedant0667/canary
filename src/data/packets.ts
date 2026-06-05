// Test-data registry: the three discharge packets + their committed cached
// extractions. PRD §5 / scoring spec §10–§11. Switching packets live IS the
// "play with the inputs" demo beat (replaces sliders).
//
// rawText = the styled hospital paperwork (imported ?raw, fed to the live
// extractor). cachedRecord = the exact PatientRecord the LLM would extract,
// committed so the demo is unkillable offline (`F` key fallback).
import type { PatientRecord } from '../types';

import mrsRRaw from './packets/mrs-r.md?raw';
import mrDRaw from './packets/mr-d.md?raw';
import msKRaw from './packets/ms-k.md?raw';

import mrsRRecord from './extractions/mrs-r.json';
import mrDRecord from './extractions/mr-d.json';
import msKRecord from './extractions/ms-k.json';

export interface PacketMeta {
  id: 'mrs-r' | 'mr-d' | 'ms-k';
  label: string;
  blurb: string;
  rawText: string;
  cachedRecord: PatientRecord;
}

export const PACKETS: PacketMeta[] = [
  {
    id: 'mrs-r',
    label: 'Mrs. R',
    blurb: '72F CHF, stable, daughter caregiver',
    rawText: mrsRRaw,
    cachedRecord: mrsRRecord as PatientRecord,
  },
  {
    id: 'mr-d',
    label: 'Mr. D',
    blurb: '68M CHF, SpO2 93, weight +3.1 lb, part-time caregiver',
    rawText: mrDRaw,
    cachedRecord: mrDRecord as PatientRecord,
  },
  {
    id: 'ms-k',
    label: 'Ms. K',
    blurb: '81F CHF, SpO2 91, lives alone',
    rawText: msKRaw,
    cachedRecord: msKRecord as PatientRecord,
  },
];
