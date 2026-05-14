import { describe, it, expect, beforeEach } from 'vitest';
import { db, type RecommendationItem } from '../../../src/lib/db/schema';
import {
  getDefaultRecommendations,
  getOverlay,
  saveOverlay,
  clearOverlay,
  getAllOverlays,
  mergeRecommendations,
  mergeRecommendationsForDomains,
  DOMAINS,
  CATEGORIES,
} from '../../../src/lib/db/recommendations';

describe('recommendations DAO + merge', () => {
  const TENANT_A = 'tenant-a';
  const TENANT_B = 'tenant-b';

  beforeEach(async () => {
    await db.recommendationOverlays.clear();
  });

  describe('default matrix', () => {
    it('exposes 8 domains and 3 categories', () => {
      expect(DOMAINS.length).toBe(8);
      expect(CATEGORIES).toEqual(['normal', 'monitor', 'refer']);
    });

    it('refer category always includes when-to-seek-help for every domain', () => {
      for (const d of DOMAINS) {
        const list = getDefaultRecommendations('refer', d);
        const hasReferral = list.some((i) => i.source === 'internal' && i.slug === 'when-to-seek-help');
        expect(hasReferral).toBe(true);
      }
    });

    it('normal category has no defaults (empty lists)', () => {
      for (const d of DOMAINS) {
        expect(getDefaultRecommendations('normal', d)).toEqual([]);
      }
    });
  });

  describe('overlay CRUD', () => {
    it('returns null when no overlay exists', async () => {
      expect(await getOverlay(TENANT_A, 'monitor', 'gross_motor')).toBeNull();
    });

    it('saves and reads an overlay', async () => {
      const items: RecommendationItem[] = [{ source: 'external', url: 'https://example.com', title: 'X' }];
      await saveOverlay(TENANT_A, 'monitor', 'gross_motor', items, false);
      const out = await getOverlay(TENANT_A, 'monitor', 'gross_motor');
      expect(out).not.toBeNull();
      expect(out?.items[0]?.url).toBe('https://example.com');
      expect(out?.mergeWithDefault).toBe(false);
    });

    it('upserts on the same composite key', async () => {
      await saveOverlay(TENANT_A, 'monitor', 'gross_motor', [{ source: 'internal', slug: 'a' }], true);
      await saveOverlay(TENANT_A, 'monitor', 'gross_motor', [{ source: 'internal', slug: 'b' }], false);
      const out = await getOverlay(TENANT_A, 'monitor', 'gross_motor');
      expect(out?.items.length).toBe(1);
      expect(out?.items[0]?.slug).toBe('b');
      expect(out?.mergeWithDefault).toBe(false);
    });

    it('isolates overlays per tenant', async () => {
      await saveOverlay(TENANT_A, 'monitor', 'gross_motor', [{ source: 'internal', slug: 'a' }], true);
      await saveOverlay(TENANT_B, 'monitor', 'gross_motor', [{ source: 'internal', slug: 'b' }], true);
      const a = await getOverlay(TENANT_A, 'monitor', 'gross_motor');
      const b = await getOverlay(TENANT_B, 'monitor', 'gross_motor');
      expect(a?.items[0]?.slug).toBe('a');
      expect(b?.items[0]?.slug).toBe('b');
    });

    it('clearOverlay deletes the row', async () => {
      await saveOverlay(TENANT_A, 'monitor', 'gross_motor', [{ source: 'internal', slug: 'a' }], true);
      await clearOverlay(TENANT_A, 'monitor', 'gross_motor');
      expect(await getOverlay(TENANT_A, 'monitor', 'gross_motor')).toBeNull();
    });

    it('getAllOverlays returns only the tenant rows', async () => {
      await saveOverlay(TENANT_A, 'monitor', 'gross_motor', [], true);
      await saveOverlay(TENANT_A, 'refer', 'cognition', [], true);
      await saveOverlay(TENANT_B, 'monitor', 'gross_motor', [], true);
      const list = await getAllOverlays(TENANT_A);
      expect(list).toHaveLength(2);
    });
  });

  describe('mergeRecommendations', () => {
    it('returns defaults when no overlay exists', async () => {
      const out = await mergeRecommendations(TENANT_A, 'monitor', 'gross_motor');
      const defaults = getDefaultRecommendations('monitor', 'gross_motor');
      expect(out).toEqual(defaults);
    });

    it('replaces default when mergeWithDefault=false', async () => {
      await saveOverlay(
        TENANT_A,
        'monitor',
        'gross_motor',
        [{ source: 'external', url: 'https://only.example.com' }],
        false,
      );
      const out = await mergeRecommendations(TENANT_A, 'monitor', 'gross_motor');
      expect(out).toHaveLength(1);
      expect(out[0]?.url).toBe('https://only.example.com');
    });

    it('appends to default when mergeWithDefault=true (deduped)', async () => {
      const defaults = getDefaultRecommendations('monitor', 'gross_motor');
      await saveOverlay(
        TENANT_A,
        'monitor',
        'gross_motor',
        [{ source: 'external', url: 'https://extra.example.com', title: '額外' }],
        true,
      );
      const out = await mergeRecommendations(TENANT_A, 'monitor', 'gross_motor');
      expect(out.length).toBe(defaults.length + 1);
      expect(out[out.length - 1]?.url).toBe('https://extra.example.com');
    });

    it('dedups overlay items already present in defaults', async () => {
      const defaultSlug = getDefaultRecommendations('monitor', 'gross_motor')[0]?.slug;
      await saveOverlay(
        TENANT_A,
        'monitor',
        'gross_motor',
        [{ source: 'internal', slug: defaultSlug! }],
        true,
      );
      const out = await mergeRecommendations(TENANT_A, 'monitor', 'gross_motor');
      const matches = out.filter((i) => i.slug === defaultSlug);
      expect(matches.length).toBe(1);
    });
  });

  describe('mergeRecommendationsForDomains', () => {
    it('dedups items across domains', async () => {
      // 'language-stimulation' is the default for both language_comp and language_expr in monitor
      const out = await mergeRecommendationsForDomains(TENANT_A, 'monitor', ['language_comp', 'language_expr']);
      const langStim = out.filter((i) => i.slug === 'language-stimulation');
      expect(langStim.length).toBe(1);
    });

    it('returns empty when domains is empty', async () => {
      expect(await mergeRecommendationsForDomains(TENANT_A, 'monitor', [])).toEqual([]);
    });

    it('respects overlay replacement on one domain only', async () => {
      await saveOverlay(
        TENANT_A,
        'monitor',
        'gross_motor',
        [{ source: 'external', url: 'https://override.example.com' }],
        false,
      );
      const out = await mergeRecommendationsForDomains(TENANT_A, 'monitor', ['gross_motor', 'fine_motor']);
      // gross_motor should only have the override (no exercise-guide etc.)
      const hasGrossMotorDefault = out.some((i) => i.slug === 'gross-motor-activities');
      const hasOverride = out.some((i) => i.url === 'https://override.example.com');
      expect(hasGrossMotorDefault).toBe(false);
      expect(hasOverride).toBe(true);
      // fine_motor should still have its default
      const hasFineMotorDefault = out.some((i) => i.slug === 'fine-motor-activities');
      expect(hasFineMotorDefault).toBe(true);
    });
  });
});
