/// <reference types="vite/client" />
// Canary — readiness improvement recommendations (live Anthropic tool-use call).
//
// Given a patient record + the deterministic engine's score breakdown, Claude
// produces a short, prioritized checklist of concrete steps the care team can take
// to raise this patient's HOME READINESS. The engine still owns the recommendation;
// this only suggests how to close the specific gaps that lowered the score.

import Anthropic from '@anthropic-ai/sdk';
import type { PatientRecord, ScoreResult } from '../types';

const MODEL = 'claude-sonnet-4-6';
const TIMEOUT_MS = 20000;
const TOOL_NAME = 'record_recommendations';

export interface Recommendation {
  action: string; // the concrete step
  addresses: string; // which factor/gate it targets
  impact: 'high' | 'medium' | 'low';
}

export type RecommendationResult =
  | { ok: true; items: Recommendation[] }
  | { ok: false; reason: 'no_key' | 'timeout' | 'no_tool' | 'error'; message: string };

const SYSTEM_PROMPT =
  'You are a CHF hospital-at-home readiness advisor. You are given a patient record and the ' +
  'breakdown from a deterministic rules engine that scores HOME READINESS across three gates ' +
  '(A clinical stability, B monitoring feasibility, C home & social readiness) plus red flags. ' +
  'Produce a SHORT, prioritized checklist (3–6 items) of concrete, practical steps the care team ' +
  'can take to raise this patient\'s readiness for safe home management — focused on the specific ' +
  'gaps that lowered the score (missing/deliverable devices, weak home/social factors, borderline ' +
  'vitals needing closer monitoring or stabilization before discharge). Each item is one actionable ' +
  'step, names the factor it addresses, and an impact (high/medium/low). Do not diagnose, do not ' +
  'prescribe medications, and do not change the disposition — these are readiness-improvement steps. ' +
  'Call the record_recommendations tool exactly once.';

const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'One concrete, actionable step' },
          addresses: { type: 'string', description: 'The factor/gate this targets, e.g. "Gate C: connectivity" or "monitoring devices"' },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['action', 'addresses', 'impact'],
      },
    },
  },
  required: ['items'],
} as const;

// Compact, model-readable summary of what dragged the score down.
function buildContext(record: PatientRecord, score: ScoreResult): string {
  const lines: string[] = [];
  lines.push(`Patient: ${record.name ?? 'unknown'}, age ${record.age ?? '?'}, condition ${record.condition}.`);
  lines.push(`Overall readiness: ${score.overall}/100, band: ${score.band}.`);
  if (score.red_flags.length) {
    lines.push(`Red flags: ${score.red_flags.map((f) => f.label).join('; ')}.`);
  }
  for (const g of score.gates) {
    lines.push(`Gate ${g.id} (${g.label}): ${g.score}/100 — ${g.status}.`);
    const weak = g.contributions.filter((c) => c.status !== 'in');
    for (const c of weak) {
      lines.push(`  • ${c.label}: ${c.status} — ${c.note}`);
    }
  }
  lines.push(
    `Similar prior patients managed at home: ${Math.round(score.similar_outcomes.home_success_rate * 100)}% (n=${score.similar_outcomes.n}).`,
  );
  return lines.join('\n');
}

export async function recommendImprovements(
  record: PatientRecord,
  score: ScoreResult,
): Promise<RecommendationResult> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: 'no_key',
      message: 'Recommendations need an Anthropic API key. Set VITE_ANTHROPIC_API_KEY in .env and restart.',
    };
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
            description: 'Record the prioritized readiness-improvement checklist.',
            input_schema: TOOL_SCHEMA as unknown as Anthropic.Tool['input_schema'],
          },
        ],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [{ role: 'user', content: buildContext(record, score) }],
      },
      { signal: controller.signal },
    );

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      return { ok: false, reason: 'no_tool', message: 'The model did not return a checklist. Try again.' };
    }
    const items = (toolUse.input as { items?: Recommendation[] }).items ?? [];
    return { ok: true, items };
  } catch (err) {
    console.error('[Canary] recommendImprovements failed:', err);
    if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      return { ok: false, reason: 'timeout', message: 'Recommendations took too long. Try again.' };
    }
    const message = err instanceof Error ? err.message : 'Recommendation request failed.';
    return { ok: false, reason: 'error', message };
  } finally {
    clearTimeout(timeout);
  }
}
