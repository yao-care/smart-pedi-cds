import { describe, it, expect } from 'vitest';
import { selectCardsForGame, type CardItem, type CardDomain } from '../../src/engine/cdsa/card-selector';

const DOMAINS: CardDomain[] = [
  'gross_motor', 'fine_motor', 'language_comp',
  'language_expr', 'cognition', 'social_emotional',
];

function makeCard(id: string, domain: CardDomain, overrides: Partial<CardItem> = {}): CardItem {
  return {
    id,
    domain,
    filename: `${domain}/${id}.webp`,
    description: `${id} 描述`,
    source: 'manual',
    sourceUrl: 'https://example.com',
    license: 'CC0',
    reviewStatus: 'approved',
    ...overrides,
  };
}

// Deterministic seed-based RNG for reproducibility
function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

describe('selectCardsForGame', () => {
  const pool: CardItem[] = DOMAINS.flatMap((d) =>
    Array.from({ length: 5 }, (_, i) => makeCard(`${d}-${i}`, d)),
  );

  it('returns empty when pool has no approved cards', () => {
    const all = pool.map((c) => ({ ...c, reviewStatus: 'pending' as const }));
    expect(selectCardsForGame(all, '25-36m', 6)).toEqual([]);
  });

  it('returns at most `count` cards', () => {
    const out = selectCardsForGame(pool, '25-36m', 6, seededRng(1));
    expect(out.length).toBeLessThanOrEqual(6);
  });

  it('balances across domains when count >= domains', () => {
    const out = selectCardsForGame(pool, '25-36m', 6, seededRng(1));
    const domains = new Set(out.map((c) => c.domain));
    // With 6 domains and 6 picks, at least 5 distinct domains expected
    expect(domains.size).toBeGreaterThanOrEqual(5);
  });

  it('respects ageGroups filter when present', () => {
    const filtered = pool.map((c) =>
      c.domain === 'gross_motor' ? { ...c, ageGroups: ['37-48m', '49-60m'] } : c,
    );
    const out = selectCardsForGame(filtered, '25-36m', 12, seededRng(2));
    expect(out.every((c) => c.domain !== 'gross_motor' || !c.ageGroups?.length || c.ageGroups.includes('25-36m'))).toBe(true);
    const grossMotorPicks = out.filter((c) => c.domain === 'gross_motor');
    expect(grossMotorPicks.length).toBe(0);
  });

  it('skips cards with non-empty ageGroups that exclude target', () => {
    const out = selectCardsForGame(
      [makeCard('a', 'cognition', { ageGroups: ['61-72m'] })],
      '25-36m',
      5,
    );
    expect(out).toEqual([]);
  });

  it('includes cards with empty/missing ageGroups for any age', () => {
    const card = makeCard('any', 'cognition');
    expect(card.ageGroups).toBeUndefined();
    const out = selectCardsForGame([card], '2-6m', 5);
    expect(out).toHaveLength(1);
  });

  it('is deterministic with same rng seed', () => {
    const a = selectCardsForGame(pool, '25-36m', 6, seededRng(42));
    const b = selectCardsForGame(pool, '25-36m', 6, seededRng(42));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it('returns all available when pool smaller than count', () => {
    const tiny = [makeCard('only', 'cognition')];
    expect(selectCardsForGame(tiny, '25-36m', 6)).toHaveLength(1);
  });

  it('excludes rejected cards', () => {
    const tainted = [
      ...pool.slice(0, 5),
      makeCard('bad', 'cognition', { reviewStatus: 'rejected' }),
    ];
    const out = selectCardsForGame(tainted, '25-36m', 10);
    expect(out.find((c) => c.id === 'bad')).toBeUndefined();
  });
});
