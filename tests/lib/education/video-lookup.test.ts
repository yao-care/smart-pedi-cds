import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RuntimeIndex, RuntimeVideo } from '../../../src/lib/education/schemas';

const mockVideo = (id: string, score: number, sourceTier: RuntimeVideo['sourceTier'] = 'official-tw'): RuntimeVideo => ({
  videoId: id, title: `t-${id}`, channel: 'c', duration: 200,
  language: 'zh-Hant', sourceTier, score,
});

const mockIndex: RuntimeIndex = {
  catalog: {
    v1: mockVideo('v1', 0.9),
    v2: mockVideo('v2', 0.7),
    v3: mockVideo('v3', 0.5),
  },
  triggers: {
    'cdsa.triage.refer.13-24m': { videoIds: ['v1', 'v2'], inapplicable: false },
    'cdsa.domain.fine_motor.anomaly.2-6m': { videoIds: [], inapplicable: true },
    'cdsa.domain.fine_motor.anomaly.7-12m': { videoIds: ['v3'], inapplicable: false },
    'cdsa.domain.fine_motor.anomaly.13-24m': { videoIds: [], inapplicable: false },
  },
};

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockIndex,
  } as Response);
  vi.resetModules();
});

describe('video-lookup', () => {
  it('returns sorted videos for matched trigger', async () => {
    const { getVideosForTrigger } = await import('../../../src/lib/education/video-lookup');
    const videos = await getVideosForTrigger('cdsa.triage.refer.13-24m');
    expect(videos.map(v => v.videoId)).toEqual(['v1', 'v2']);
  });

  it('returns empty for inapplicable trigger (custom ignored)', async () => {
    const { getVideosForTrigger } = await import('../../../src/lib/education/video-lookup');
    const custom = [{ ...mockVideo('vCustom', 1.0), triggers: '*' as const }];
    const videos = await getVideosForTrigger('cdsa.domain.fine_motor.anomaly.2-6m', custom);
    expect(videos).toEqual([]);
  });

  it('ageGroupFallback returns videos from 7-12m when 13-24m empty', async () => {
    const { getVideosForTrigger } = await import('../../../src/lib/education/video-lookup');
    const videos = await getVideosForTrigger('cdsa.domain.fine_motor.anomaly.13-24m', [], {
      ageGroupFallback: true,
    });
    expect(videos.map(v => v.videoId)).toEqual(['v3']);
  });

  it('ageGroupFallback skips inapplicable chain entries', async () => {
    const { getVideosForTrigger } = await import('../../../src/lib/education/video-lookup');
    const videos = await getVideosForTrigger('cdsa.domain.fine_motor.anomaly.7-12m', [], {
      ageGroupFallback: true,
    });
    expect(videos.map(v => v.videoId)).toEqual(['v3']);
  });

  it('retries after fetch failure', async () => {
    let attempt = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) throw new Error('network');
      return { ok: true, json: async () => mockIndex } as Response;
    });

    const { getVideosForTrigger } = await import('../../../src/lib/education/video-lookup');
    await expect(getVideosForTrigger('cdsa.triage.refer.13-24m')).rejects.toThrow();
    const videos = await getVideosForTrigger('cdsa.triage.refer.13-24m');
    expect(videos).toHaveLength(2);
  });

  it('regex correctly parses cdsa.domain.<dom>.anomaly.<age>', async () => {
    const { tryAgeGroupFallback } = await import('../../../src/lib/education/video-lookup');
    const ids = tryAgeGroupFallback('cdsa.domain.fine_motor.anomaly.13-24m', mockIndex);
    expect(ids).toEqual(['v3']);
  });
});
