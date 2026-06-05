/// <reference types="vite/client" />
// CareLoop extraction client (PRD §3).
//
// The packet carries `rawText` (the referral note) plus a hand-authored
// `cachedRecord` that is ALWAYS a valid PatientRecord. Live extraction is a
// progressive enhancement: if no API key is configured, or anything goes wrong,
// or it takes too long, we silently fall back to the cached record so the demo
// never stalls and never shows a half-extracted patient.
//
// "UI never computes clinically" — this module only shapes a PatientRecord; the
// engine scores it. Extraction here just turns prose into the §2 schema.

import Anthropic from '@anthropic-ai/sdk';
import type { PatientRecord } from '../types';

// Minimal shape of a demo packet. We only depend on the two fields we need so
// this module doesn't couple to the packets data file (owned elsewhere).
export interface ExtractionPacket {
  rawText: string;
  cachedRecord: PatientRecord;
}

export interface ExtractionOptions {
  forceFallback?: boolean;
}

export interface ExtractionResult {
  record: PatientRecord;
  source: 'live' | 'cache';
}

const MODEL = 'claude-sonnet-4-6'; // do NOT change (per build contract)
const TIMEOUT_MS = 6000;
const TOOL_NAME = 'extract_patient';

// JSON Schema mirroring PatientRecord ([SCORING] §2 / src/types.ts). All fields
// nullable — missing data is handled downstream by the confidence model (§7),
// never by guessing here.
const PATIENT_RECORD_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: ['string', 'null'] },
    age: { type: ['integer', 'null'] },
    mrn: { type: ['string', 'null'] },
    condition: { type: 'string', enum: ['CHF'] },
    vitals: {
      type: 'object',
      properties: {
        hr_bpm: { type: ['number', 'null'] },
        bp_systolic: { type: ['number', 'null'] },
        bp_diastolic: { type: ['number', 'null'] },
        spo2_pct: { type: ['number', 'null'] },
        resp_rate: { type: ['number', 'null'] },
        temp_c: { type: ['number', 'null'] },
        weight_lb: { type: ['number', 'null'] },
        weight_delta_72h_lb: { type: ['number', 'null'] },
      },
      required: [
        'hr_bpm',
        'bp_systolic',
        'bp_diastolic',
        'spo2_pct',
        'resp_rate',
        'temp_c',
        'weight_lb',
        'weight_delta_72h_lb',
      ],
    },
    symptoms: {
      type: 'object',
      properties: {
        dyspnea: { type: ['string', 'null'], enum: ['none', 'exertional', 'at_rest', null] },
        edema: { type: ['string', 'null'], enum: ['none', 'stable', 'worsening', null] },
        chest_pain: { type: ['boolean', 'null'] },
      },
      required: ['dyspnea', 'edema', 'chest_pain'],
    },
    devices_available: {
      type: 'array',
      items: { type: 'string', enum: ['scale', 'bp_cuff', 'pulse_ox', 'ecg_patch'] },
    },
    devices_deliverable_today: {
      type: 'array',
      items: { type: 'string', enum: ['scale', 'bp_cuff', 'pulse_ox', 'ecg_patch'] },
    },
    home: {
      type: 'object',
      properties: {
        caregiver: { type: ['string', 'null'], enum: ['none', 'part_time', 'full_time', null] },
        housing_stable: { type: ['boolean', 'null'] },
        has_power_refrigeration: { type: ['boolean', 'null'] },
        connectivity: { type: ['string', 'null'], enum: ['none', 'cell_only', 'wifi', null] },
        med_self_admin: { type: ['string', 'null'], enum: ['yes', 'assisted', 'no', null] },
        fall_risk: { type: ['string', 'null'], enum: ['low', 'moderate', 'high', null] },
      },
      required: [
        'caregiver',
        'housing_stable',
        'has_power_refrigeration',
        'connectivity',
        'med_self_admin',
        'fall_risk',
      ],
    },
  },
  required: ['name', 'age', 'mrn', 'condition', 'vitals', 'symptoms', 'devices_available', 'home'],
} as const;

const SYSTEM_PROMPT =
  'You extract a structured CHF patient record from a home-care referral note. ' +
  'Use only what the note states. For any field the note does not mention, return null ' +
  '(do not infer or guess). Map vital signs and home/social factors to the provided schema. ' +
  'Always call the extract_patient tool exactly once.';

/**
 * Extract a PatientRecord from a packet's raw referral text.
 *
 * Falls back to `packet.cachedRecord` (source: 'cache') when:
 *  - `opts.forceFallback` is set, or
 *  - no `VITE_ANTHROPIC_API_KEY` is configured, or
 *  - the API call errors or exceeds the 6000ms timeout.
 *
 * On success returns the live-extracted record (source: 'live').
 */
export async function extractPacket(
  packet: ExtractionPacket,
  opts: ExtractionOptions = {},
): Promise<ExtractionResult> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  if (opts.forceFallback || !apiKey) {
    return { record: packet.cachedRecord, source: 'cache' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: TOOL_NAME,
            description: 'Record the extracted CHF patient record.',
            input_schema: PATIENT_RECORD_SCHEMA as unknown as Anthropic.Tool['input_schema'],
          },
        ],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [{ role: 'user', content: packet.rawText }],
      },
      { signal: controller.signal },
    );

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      return { record: packet.cachedRecord, source: 'cache' };
    }

    return { record: toolUse.input as PatientRecord, source: 'live' };
  } catch {
    // Any error or timeout (abort) → silent fallback. The demo must never break.
    return { record: packet.cachedRecord, source: 'cache' };
  } finally {
    clearTimeout(timeout);
  }
}
