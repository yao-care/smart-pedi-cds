import { describe, it, expect } from 'vitest';
import { detectRedFlags, RED_FLAGS } from '../../src/engine/cdsa/red-flags';

describe('detectRedFlags', () => {
  it('flags "not walking" only at/after 25-36m when gm-03 is 0', () => {
    // 13-24m 答不會走 → 尚在正常範圍下限，不觸發。
    expect(detectRedFlags({ 'gm-03': 0 }, '13-24m').map((f) => f.id)).not.toContain('not-walking');
    // 25-36m 仍不會走 → 紅旗。
    expect(detectRedFlags({ 'gm-03': 0 }, '25-36m').map((f) => f.id)).toContain('not-walking');
    // 37-48m 也算（≥ 起始層）。
    expect(detectRedFlags({ 'gm-03': 0 }, '37-48m').map((f) => f.id)).toContain('not-walking');
  });

  it('does not flag when the milestone is met (score > 0)', () => {
    expect(detectRedFlags({ 'gm-03': 1 }, '25-36m')).toEqual([]);
    expect(detectRedFlags({ 'gm-03': 2 }, '25-36m')).toEqual([]);
  });

  it('does not flag when the question was not answered (absent)', () => {
    expect(detectRedFlags({}, '25-36m')).toEqual([]);
  });

  it('flags no-first-words / no-name-response / no-pointing at 13-24m', () => {
    const ids = detectRedFlags(
      { 'le-01': 0, 'lc-01': 0, 'le-03': 0 },
      '13-24m',
    ).map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining(['no-first-words', 'no-name-response', 'no-joint-attention-pointing']),
    );
  });

  it('flags no-social-smile from 7-12m but not at 2-6m', () => {
    expect(detectRedFlags({ 'se-01': 0 }, '2-6m').map((f) => f.id)).not.toContain('no-social-smile');
    expect(detectRedFlags({ 'se-01': 0 }, '7-12m').map((f) => f.id)).toContain('no-social-smile');
  });

  it('detects multiple red flags at once', () => {
    const flags = detectRedFlags({ 'gm-03': 0, 'se-04': 0 }, '25-36m');
    expect(flags.map((f) => f.id).sort()).toEqual(['no-pretend-play', 'not-walking']);
  });

  it('every red flag maps to a real questionnaire question id and has label+basis', () => {
    for (const f of RED_FLAGS) {
      expect(f.questionId).toMatch(/^[a-z]+-\d+$/);
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.basis.length).toBeGreaterThan(0);
    }
  });
});
