import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildVideoIndex } from '../../scripts/build-video-index';

let tmpDir: string;

async function copyFixture(): Promise<string> {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), 'video-idx-'));
  await fs.cp('tests/fixtures/video-yaml', dest, { recursive: true });
  return dest;
}

describe('buildVideoIndex', () => {
  beforeEach(async () => { tmpDir = await copyFixture(); });

  it('emits public/data/video-index.json with verified videos only', async () => {
    await buildVideoIndex({ cwd: tmpDir });
    const idx = JSON.parse(await fs.readFile(`${tmpDir}/public/data/video-index.json`, 'utf8'));
    expect(idx.catalog).toHaveProperty('abc123XYZ45');
    expect(idx.catalog).not.toHaveProperty('def456ABC78');
  });

  it('filters rejected videoIds from trigger entries', async () => {
    await buildVideoIndex({ cwd: tmpDir });
    const idx = JSON.parse(await fs.readFile(`${tmpDir}/public/data/video-index.json`, 'utf8'));
    expect(idx.triggers['cdsa.triage.refer.13-24m'].videoIds).toEqual(['abc123XYZ45']);
  });

  it('produces byte-identical output across runs (reproducible)', async () => {
    await buildVideoIndex({ cwd: tmpDir });
    const a = await fs.readFile(`${tmpDir}/public/data/video-index.json`);
    await buildVideoIndex({ cwd: tmpDir });
    const b = await fs.readFile(`${tmpDir}/public/data/video-index.json`);
    expect(a.equals(b)).toBe(true);
  });

  it('hard-fails on inapplicable matrix ↔ yaml mismatch', async () => {
    const yamlPath = `${tmpDir}/src/data/education-videos/cdsa-domains.yaml`;
    await fs.writeFile(yamlPath, `
- trigger: cdsa.domain.fine_motor.anomaly.7-12m
  category: domain
  domain: fine_motor
  ageGroup: 7-12m
  inapplicable: true
  videoIds: []
`);
    await expect(buildVideoIndex({ cwd: tmpDir })).rejects.toThrow(/inapplicable/);
  });

  it('hard-fails on trigger referencing missing videoId', async () => {
    const yamlPath = `${tmpDir}/src/data/education-videos/cdsa-triage.yaml`;
    await fs.writeFile(yamlPath, `
- trigger: cdsa.triage.refer.13-24m
  category: triage
  triageCategory: refer
  ageGroup: 13-24m
  videoIds: [zzzzzzzzzzz]
`);
    await expect(buildVideoIndex({ cwd: tmpDir })).rejects.toThrow(/unknown videoId/);
  });

  it('hard-fails on missing educationSlug', async () => {
    const yamlPath = `${tmpDir}/src/data/education-videos/cdsa-triage.yaml`;
    await fs.writeFile(yamlPath, `
- trigger: cdsa.triage.refer.13-24m
  category: triage
  triageCategory: refer
  ageGroup: 13-24m
  educationSlug: nonexistent-slug
  videoIds: [abc123XYZ45]
`);
    await expect(buildVideoIndex({ cwd: tmpDir })).rejects.toThrow(/educationSlug/);
  });

  it('emits educationSlugToTriggers for triggers with educationSlug and verified videos', async () => {
    await buildVideoIndex({ cwd: tmpDir });
    const idx = JSON.parse(await fs.readFile(`${tmpDir}/public/data/video-index.json`, 'utf8'));
    expect(idx.educationSlugToTriggers).toEqual({
      'when-to-seek-help': ['cdsa.triage.refer.13-24m'],
    });
  });

  it('detects duplicate videoId across catalog files', async () => {
    await fs.writeFile(`${tmpDir}/src/data/video-catalog/international.yaml`, `
- videoId: "abc123XYZ45"
  title: "重複"
  channel: "X"
  channelId: "UCzzzzzzzzzzzzzzzzzzzzzz"
  duration: 60
  publishedAt: "2024-01-01"
  language: "en"
  subtitleType: "auto"
  sourceTier: "international"
  viewCount: 0
  curatedAt: "2026-01-01"
  verifiedBy: "claude-code"
  verificationStatus: "verified"
  score: 0.5
`);
    await expect(buildVideoIndex({ cwd: tmpDir })).rejects.toThrow(/Duplicate videoId/);
  });
});
