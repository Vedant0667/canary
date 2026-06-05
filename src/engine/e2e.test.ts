// End-to-end demo guarantee: the committed cached extractions for the three
// packets must score to the bands the demo narrates (design §5 / scoring spec §11).
// This locks the on-stage story to the engine output — if either drifts, this fails.

import { describe, expect, it } from 'vitest';
import { PACKETS } from '../data/packets';
import { scoreEligibility } from './scoring';

function byId(id: string) {
  const packet = PACKETS.find((p) => p.id === id);
  if (!packet) throw new Error(`packet not found: ${id}`);
  return packet;
}

describe('cached extraction → expected demo band', () => {
  it('Mrs. R scores 86 / eligible', () => {
    const result = scoreEligibility(byId('mrs-r').cachedRecord);
    expect(result.overall).toBe(86);
    expect(result.band).toBe('eligible');
  });

  it('Mr. D scores into watch', () => {
    const result = scoreEligibility(byId('mr-d').cachedRecord);
    expect(result.band).toBe('watch');
  });

  it('Ms. K scores into admit', () => {
    const result = scoreEligibility(byId('ms-k').cachedRecord);
    expect(result.band).toBe('admit');
  });
});
