import { describe, it, expect } from 'vitest';
import { selectCardsForGame, selectDistractors, type CardItem, type CardDomain } from '../../src/engine/cdsa/card-selector';

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

describe('selectDistractors', () => {
  const target = makeCard('cog-circle-light', 'cognition', {
    description: '認知：圓形（亮）',
  });
  const sameDomainDifferent = [
    makeCard('cog-square-light', 'cognition', { description: '認知：方形（亮）' }),
    makeCard('cog-triangle-light', 'cognition', { description: '認知：三角形（亮）' }),
    makeCard('cog-star-light', 'cognition', { description: '認知：星形（亮）' }),
  ];
  const sameDomainSameDescription = [
    makeCard('cog-circle-dup', 'cognition', { description: '認知：圓形（亮）' }),
  ];
  const otherDomain = [
    makeCard('gm-running', 'gross_motor', { description: '粗動作：跑步' }),
    makeCard('gm-jumping', 'gross_motor', { description: '粗動作：跳' }),
  ];

  it('returns same-domain different-description cards first', () => {
    const pool = [target, ...sameDomainDifferent, ...otherDomain];
    const distractors = selectDistractors(pool, target, 2);
    expect(distractors).toHaveLength(2);
    for (const d of distractors) {
      expect(d.domain).toBe('cognition');
      expect(d.description).not.toBe(target.description);
    }
  });

  it('never includes the target itself', () => {
    const pool = [target, ...sameDomainDifferent];
    const distractors = selectDistractors(pool, target, 3);
    expect(distractors.find((d) => d.id === target.id)).toBeUndefined();
  });

  it('falls back to same-domain same-description when tier 1 is exhausted', () => {
    const pool = [target, sameDomainDifferent[0], ...sameDomainSameDescription];
    const distractors = selectDistractors(pool, target, 2);
    expect(distractors).toHaveLength(2);
    expect(distractors.map((d) => d.id).sort()).toContain('cog-circle-dup');
  });

  it('falls back to other domains as last resort', () => {
    const pool = [target, ...otherDomain];
    const distractors = selectDistractors(pool, target, 2);
    expect(distractors).toHaveLength(2);
    expect(distractors.every((d) => d.domain === 'gross_motor')).toBe(true);
  });

  it('returns fewer than requested when the pool is too small', () => {
    const distractors = selectDistractors([target], target, 3);
    expect(distractors).toHaveLength(0);
  });

  it('never returns duplicates', () => {
    const pool = [target, ...sameDomainDifferent];
    const distractors = selectDistractors(pool, target, 3);
    const ids = new Set(distractors.map((d) => d.id));
    expect(ids.size).toBe(distractors.length);
  });
});
