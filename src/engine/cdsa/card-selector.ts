export type CardDomain =
  | 'gross_motor'
  | 'fine_motor'
  | 'language_comp'
  | 'language_expr'
  | 'cognition'
  | 'social_emotional';

export interface CardItem {
  id: string;
  domain: CardDomain;
  filename: string;
  description: string;
  ageGroups?: string[];
  source: string;
  sourceUrl: string;
  attribution?: string;
  license: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewedAt?: string;
}

function shuffle<T>(array: T[], rng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Select cards for one game block.
 * - Only `approved` cards are considered.
 * - Cards whose `ageGroups` list is non-empty must include the target group.
 * - Balances across domains: takes at most ceil(count / domains) per domain.
 * - Falls back gracefully when pool is too small (returns whatever is available).
 */
export function selectCardsForGame(
  pool: CardItem[],
  ageGroup: string,
  count: number,
  rng: () => number = Math.random,
): CardItem[] {
  const eligible = pool.filter((card) => {
    if (card.reviewStatus !== 'approved') return false;
    if (card.ageGroups && card.ageGroups.length > 0 && !card.ageGroups.includes(ageGroup)) {
      return false;
    }
    return true;
  });

  if (eligible.length === 0) return [];

  const byDomain = new Map<CardDomain, CardItem[]>();
  for (const card of eligible) {
    const list = byDomain.get(card.domain) ?? [];
    list.push(card);
    byDomain.set(card.domain, list);
  }

  const domains = Array.from(byDomain.keys());
  const perDomain = Math.ceil(count / Math.max(1, domains.length));

  const picks: CardItem[] = [];
  for (const domain of domains) {
    const list = shuffle(byDomain.get(domain)!, rng);
    picks.push(...list.slice(0, perDomain));
  }

  return shuffle(picks, rng).slice(0, count);
}
