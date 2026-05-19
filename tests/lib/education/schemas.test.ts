import { describe, it, expect } from 'vitest';
import {
  videoCatalogItemSchema, triggerEntrySchema,
  cdsaTriageEntrySchema, cdsaDomainEntrySchema, cdssVitalSignEntrySchema,
} from '../../../src/lib/education/schemas';

const validVideo = {
  videoId: 'abc123XYZ45',
  title: '範例衛教',
  channel: '台大兒醫',
  channelId: 'UC' + 'a'.repeat(22),
  duration: 245,
  publishedAt: '2024-03-15',
  language: 'zh-Hant' as const,
  subtitleType: 'human' as const,
  sourceTier: 'official-tw' as const,
  viewCount: 12500,
  curatedAt: '2026-05-19',
  verifiedBy: 'claude-code' as const,
  verificationStatus: 'verified' as const,
  score: 0.92,
};

describe('videoCatalogItemSchema', () => {
  it('accepts a valid catalog item', () => {
    expect(videoCatalogItemSchema.parse(validVideo)).toBeDefined();
  });

  it('rejects invalid videoId regex (10 chars)', () => {
    expect(() => videoCatalogItemSchema.parse({ ...validVideo, videoId: 'abc123XYZ4' })).toThrow();
  });

  it('rejects invalid videoId regex (12 chars)', () => {
    expect(() => videoCatalogItemSchema.parse({ ...validVideo, videoId: 'abc123XYZ455' })).toThrow();
  });

  it('rejects invalid channelId regex', () => {
    expect(() => videoCatalogItemSchema.parse({ ...validVideo, channelId: 'NotAChannelId' })).toThrow();
  });

  it('rejects score > 1', () => {
    expect(() => videoCatalogItemSchema.parse({ ...validVideo, score: 1.5 })).toThrow();
  });

  it('strips unknown extra fields (zod v4 default)', () => {
    const parsed = videoCatalogItemSchema.parse({ ...validVideo, foo: 'bar' });
    expect('foo' in parsed).toBe(false);
  });
});

describe('triggerEntrySchema discriminatedUnion', () => {
  it('accepts valid cdsa.triage entry', () => {
    expect(triggerEntrySchema.parse({
      trigger: 'cdsa.triage.refer.13-24m',
      category: 'triage',
      triageCategory: 'refer',
      ageGroup: '13-24m',
      videoIds: ['abc123XYZ45'],
    })).toBeDefined();
  });

  it('rejects cross-field mismatch (trigger ≠ fields)', () => {
    expect(() => cdsaTriageEntrySchema.parse({
      trigger: 'cdsa.triage.refer.25-36m',
      category: 'triage',
      triageCategory: 'refer',
      ageGroup: '13-24m',
      videoIds: [],
    })).toThrow();
  });

  it('accepts cdsa.domain with inapplicable: true', () => {
    expect(triggerEntrySchema.parse({
      trigger: 'cdsa.domain.fine_motor.anomaly.2-6m',
      category: 'domain',
      domain: 'fine_motor',
      ageGroup: '2-6m',
      inapplicable: true,
      videoIds: [],
    })).toBeDefined();
  });

  it('rejects cdsa.domain with unknown domain', () => {
    expect(() => cdsaDomainEntrySchema.parse({
      trigger: 'cdsa.domain.unknown.anomaly.13-24m',
      category: 'domain',
      domain: 'unknown',
      ageGroup: '13-24m',
      videoIds: [],
    })).toThrow();
  });

  it('accepts cdss.vital-sign with critical', () => {
    expect(triggerEntrySchema.parse({
      trigger: 'cdss.spo2.critical.infant',
      category: 'vital-sign',
      indicator: 'spo2',
      level: 'critical',
      ageGroup: 'infant',
      videoIds: [],
    })).toBeDefined();
  });

  it('rejects cdss with normal level (not in enum)', () => {
    expect(() => cdssVitalSignEntrySchema.parse({
      trigger: 'cdss.spo2.normal.infant',
      category: 'vital-sign',
      indicator: 'spo2',
      level: 'normal',
      ageGroup: 'infant',
      videoIds: [],
    })).toThrow();
  });

  it('rejects videoIds with invalid regex', () => {
    expect(() => cdsaTriageEntrySchema.parse({
      trigger: 'cdsa.triage.monitor.13-24m',
      category: 'triage',
      triageCategory: 'monitor',
      ageGroup: '13-24m',
      videoIds: ['SHORT'],
    })).toThrow();
  });

  it('strips extra indicator field on category=domain (zod default strip)', () => {
    const parsed = cdsaDomainEntrySchema.parse({
      trigger: 'cdsa.domain.behavior.anomaly.13-24m',
      category: 'domain',
      domain: 'behavior',
      ageGroup: '13-24m',
      indicator: 'spo2',
      videoIds: [],
    });
    expect('indicator' in parsed).toBe(false);
  });
});
