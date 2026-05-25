import { describe, it, expect } from 'vitest';
import { buildMatrixData, CDSA_DOMAINS, AGE_GROUPS_CDSA } from '$lib/education/matrix-data';

const triggers = {
  'cdsa.domain.language.anomaly.13-24m':    { videoIds: ['abc1234abcde'], inapplicable: false, educationSlug: 'language-stimulation' },
  'cdsa.domain.language.anomaly.2-6m':      { videoIds: [],               inapplicable: true  },
  'cdsa.domain.gross_motor.anomaly.13-24m': { videoIds: [],               inapplicable: false },
  // article-only cell (educationSlug, no videos) must still surface in the matrix
  'cdsa.domain.fine_motor.anomaly.13-24m':  { videoIds: [],               inapplicable: false, educationSlug: 'fine-motor-activities' },
  // cdss.* and cdsa.triage.* (incl. their educationSlug) must be ignored by the matrix
  'cdss.sugar_intake.critical.toddler':     { videoIds: ['xyz'],          inapplicable: false, educationSlug: 'diet-control' },
  'cdsa.triage.refer.13-24m':               { videoIds: [],               inapplicable: false },
};

describe('buildMatrixData', () => {
  it('initialises all domain×age combinations', () => {
    const data = buildMatrixData({});
    for (const domain of CDSA_DOMAINS) {
      for (const age of AGE_GROUPS_CDSA) {
        expect(data[`${domain}:${age}`]).toBeDefined();
      }
    }
  });

  it('marks inapplicable cells', () => {
    const data = buildMatrixData(triggers);
    expect(data['language:2-6m'].inapplicable).toBe(true);
  });

  it('populates videoIds for applicable cells', () => {
    const data = buildMatrixData(triggers);
    expect(data['language:13-24m'].videoIds).toEqual(['abc1234abcde']);
  });

  it('attaches article via the cell educationSlug', () => {
    const data = buildMatrixData(triggers);
    expect(data['language:13-24m'].articleSlugs).toContain('language-stimulation');
  });

  it('surfaces article-only cells (educationSlug without any video)', () => {
    const data = buildMatrixData(triggers);
    expect(data['fine_motor:13-24m'].articleSlugs).toEqual(['fine-motor-activities']);
    expect(data['fine_motor:13-24m'].videoIds).toEqual([]);
    expect(data['fine_motor:13-24m'].inapplicable).toBe(false);
  });

  it('ignores cdss and cdsa.triage educationSlugs', () => {
    const data = buildMatrixData(triggers);
    for (const domain of CDSA_DOMAINS) {
      for (const age of AGE_GROUPS_CDSA) {
        expect(data[`${domain}:${age}`].articleSlugs).not.toContain('diet-control');
      }
    }
  });

  it('applicable cell with no resources has inapplicable=false', () => {
    const data = buildMatrixData(triggers);
    expect(data['gross_motor:13-24m'].inapplicable).toBe(false);
    expect(data['gross_motor:13-24m'].videoIds).toEqual([]);
    expect(data['gross_motor:13-24m'].articleSlugs).toEqual([]);
  });

  it('treats cells with no trigger entry as applicable (contributable)', () => {
    // Regression: cells absent from the trigger map must default to applicable,
    // not inapplicable — only the explicit 10 inapplicable combos show "—".
    const data = buildMatrixData(triggers);
    expect(data['cognition:61-72m'].inapplicable).toBe(false);
    expect(data['cognition:61-72m'].videoIds).toEqual([]);
    expect(data['cognition:61-72m'].articleSlugs).toEqual([]);
  });

  it('marks only explicitly-flagged combos as inapplicable', () => {
    const data = buildMatrixData(triggers);
    let inapplicableCount = 0;
    for (const domain of CDSA_DOMAINS) {
      for (const age of AGE_GROUPS_CDSA) {
        if (data[`${domain}:${age}`].inapplicable) inapplicableCount++;
      }
    }
    // test fixture has exactly one inapplicable trigger (language:2-6m)
    expect(inapplicableCount).toBe(1);
  });
});
