/// <reference types="vite/client" />
// Canary extraction client (PRD §3).
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

// Live-only extraction (used for arbitrary pasted notes that have NO cached
// fallback). We never silently fabricate a record here: if the model can't run,
// the caller gets an honest failure reason and shows it. This is the path that
// proves Canary is genuinely AI-driven, not a lookup table.
export type LiveExtraction =
  | { ok: true; record: PatientRecord }
  | { ok: false; reason: 'no_key' | 'timeout' | 'no_tool' | 'error'; message: string };

const MODEL = 'claude-sonnet-4-6'; // structured extraction — fast, capable, low-latency for a live demo
const TIMEOUT_MS = 6000; // demo packets have a cached fallback, so keep this snappy
const TIMEOUT_LIVE_MS = 35000; // pasted notes have NO fallback — give the model room to finish
const TIMEOUT_GENERATE_MS = 45000; // writing a full note is the slowest call; be generous
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
  'You extract a structured CHF (congestive heart failure) patient record from a home-care ' +
  'referral or hospital discharge note, then call the extract_patient tool exactly once.\n\n' +
  'Rules:\n' +
  '- Extract every value the note states. Return null ONLY for fields the note does not mention. ' +
  'Never guess or infer an unstated value.\n' +
  '- Normalize units to the schema: temperature in degrees CELSIUS (convert Fahrenheit with C = (F − 32) / 1.8), ' +
  'weight in POUNDS (convert kg with lb = kg × 2.20462), blood pressure as separate systolic/diastolic numbers.\n' +
  '- weight_lb: the most recent absolute body weight stated.\n' +
  '- weight_delta_72h_lb: the SIGNED weight change over roughly the last 72 hours (about 2–3 days); ' +
  'positive means gain. If the note reports a weight change only over a clearly different window — a week or ' +
  'more, or "since last visit" — leave weight_delta_72h_lb null and still record weight_lb. Do NOT relabel a ' +
  'long-window change as a 72-hour change.\n' +
  '- dyspnea: "at_rest" only if shortness of breath occurs at rest; "exertional" for dyspnea on exertion or ' +
  'orthopnea without rest dyspnea; "none" only if explicitly denied.\n' +
  '- edema: "worsening" if increased/worsening, "stable" if unchanged or chronic, "none" if absent.\n' +
  '- chest_pain: true if reported, false if explicitly denied, null if unmentioned.\n' +
  '- devices_available: home-monitoring devices the patient already has. devices_deliverable_today: devices ' +
  'that can be delivered or dropped off the same day.\n' +
  '- Map home/social factors (caregiver, housing stability, power/refrigeration, connectivity, medication ' +
  'self-administration, fall risk) to the schema enums.';

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

  try {
    const record = await callExtraction(packet.rawText, apiKey, TIMEOUT_MS);
    return { record, source: 'live' };
  } catch {
    // Any error or timeout → silent fallback. A demo packet must never break.
    return { record: packet.cachedRecord, source: 'cache' };
  }
}

/**
 * Live-only extraction for an arbitrary, never-before-seen referral note.
 *
 * Unlike {@link extractPacket} there is NO cached record to fall back to, so we
 * return an honest, typed failure instead of fabricating data. This is the path
 * a judge exercises to confirm Canary really runs the model: paste any note,
 * watch it become a structured record and a score.
 */
export async function extractLive(rawText: string): Promise<LiveExtraction> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: 'no_key',
      message:
        'Live extraction needs an Anthropic API key. Set VITE_ANTHROPIC_API_KEY in .env and restart the dev server.',
    };
  }
  if (!rawText.trim()) {
    return { ok: false, reason: 'error', message: 'Paste a referral note first.' };
  }

  try {
    const record = await callExtraction(rawText, apiKey, TIMEOUT_LIVE_MS);
    return { ok: true, record };
  } catch (err) {
    console.error('[Canary] extractLive failed:', err);
    const aborted = err instanceof Error && err.name === 'AbortError';
    if (aborted) {
      return { ok: false, reason: 'timeout', message: 'The model took too long. Try again.' };
    }
    if (err instanceof NoToolUseError) {
      return { ok: false, reason: 'no_tool', message: 'The model did not return a structured record. Try a clearer note.' };
    }
    const message = err instanceof Error ? err.message : 'Extraction failed.';
    return { ok: false, reason: 'error', message };
  }
}

class NoToolUseError extends Error {}

// Shared request: prose in → validated PatientRecord out, via forced tool use.
// Throws on abort/timeout, API error, or a response with no tool_use block.
async function callExtraction(
  rawText: string,
  apiKey: string,
  timeoutMs: number,
): Promise<PatientRecord> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
        messages: [{ role: 'user', content: rawText }],
      },
      { signal: controller.signal },
    );

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new NoToolUseError('no tool_use block in response');
    }
    return toolUse.input as PatientRecord;
  } catch (err) {
    // The SDK throws its own APIUserAbortError on signal abort (name is NOT
    // "AbortError"), so normalize our timeout into an AbortError the callers detect.
    if (controller.signal.aborted) {
      const e = new Error('timed out');
      e.name = 'AbortError';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Scenario generation — invent a fresh, synthetic CHF referral note on demand.
// ---------------------------------------------------------------------------
//
// This powers the "Generate a patient" affordance: instead of the three canned
// packets, Claude writes a brand-new fictional discharge note, which then flows
// through the SAME live extraction + scoring path a judge would scrutinize. It
// proves the pipeline end-to-end on text that did not exist a second ago.

export type ScenarioResult =
  | { ok: true; rawText: string }
  | { ok: false; reason: 'no_key' | 'timeout' | 'error'; message: string };

const GENERATE_SYSTEM_PROMPT =
  'You write realistic, fully synthetic CHF (congestive heart failure) hospital discharge / home-care ' +
  'referral notes for a clinical software demo. Every patient is fictional — invent a plausible name, age, ' +
  'sex, and MRN. Write the note as natural prose a discharge planner would actually type (a few short ' +
  'paragraphs or a light SOAP layout), NOT as JSON or a filled-in form.\n\n' +
  'Each note must state, in plain clinical language: discharge vital signs (heart rate, blood pressure, ' +
  'SpO₂, respiratory rate, temperature, current weight, and the change in weight over the last 72 hours ' +
  '/ 2–3 days — state this window explicitly, e.g. "up 2.4 lb over the past 72 hours"), symptoms (dyspnea, ' +
  'edema, chest pain), which home-monitoring devices are already available or can be delivered today ' +
  '(scale, BP cuff, pulse oximeter, ECG patch), and the home/social situation (caregiver, housing ' +
  'stability, power/refrigeration, internet or cell connectivity, medication self-administration, fall ' +
  'risk). The device-readiness details and EVERY home/social factor are required — always include both ' +
  'sections in full, never omit or abbreviate them. Vary names, numbers, and details substantially ' +
  'every time. Output ONLY the note text — no preamble, no commentary, no code fences.';

// Three clinical archetypes so generated patients land across the eligibility
// spectrum rather than always reading as obviously-fine.
const SCENARIO_ARCHETYPES = [
  'a clearly stable patient who is a strong candidate for home management',
  'a borderline patient with one or two mildly concerning signals — home-manageable with close monitoring',
  'a sicker patient with at least one red-flag vital (e.g. SpO₂ < 92, rapid 72h weight gain, dyspnea at rest) or weak home support, who likely needs admission',
];

/**
 * Ask Claude to synthesize a fresh, never-before-seen CHF referral note.
 *
 * Returns the note text on success, or an honest typed failure. Variety comes
 * from a randomly-chosen archetype plus a seed woven into the prompt (no
 * sampling params, so it stays compatible across models).
 */
export async function generateScenario(): Promise<ScenarioResult> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: 'no_key',
      message:
        'Generating a patient needs an Anthropic API key. Set VITE_ANTHROPIC_API_KEY in .env and restart the dev server.',
    };
  }

  const archetype = SCENARIO_ARCHETYPES[Math.floor(Math.random() * SCENARIO_ARCHETYPES.length)];
  const seed = Math.floor(Math.random() * 1_000_000);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_GENERATE_MS);
  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const response = await client.messages.create(
      {
        model: MODEL,
        // A full note (demographics, vitals, symptoms, meds, devices, home/social)
        // runs long, and discharge notes put devices + social LAST — too small a
        // cap truncates exactly those sections, so they extract as "not stated".
        max_tokens: 1400,
        system: GENERATE_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content:
              `Write one new discharge/referral note. Make this case ${archetype}. ` +
              `Use fresh, distinctive details (variation seed ${seed}). Output only the note.`,
          },
        ],
      },
      { signal: controller.signal },
    );

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!text) {
      return { ok: false, reason: 'error', message: 'The model returned an empty note. Try again.' };
    }
    return { ok: true, rawText: text };
  } catch (err) {
    console.error('[Canary] generateScenario failed:', err);
    const aborted = controller.signal.aborted || (err instanceof Error && err.name === 'AbortError');
    if (aborted) {
      return { ok: false, reason: 'timeout', message: 'Generating took too long. Try again.' };
    }
    const message = err instanceof Error ? err.message : 'Generation failed.';
    return { ok: false, reason: 'error', message };
  } finally {
    clearTimeout(timeout);
  }
}
